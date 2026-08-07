import { type RequestUrlResponse, requestUrl } from "obsidian";
import type { ProviderKind, WebDavConfig } from "../types";
import { ProviderError, type RemoteEntity, type SyncProvider } from "./base";

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:getcontentlength/>
    <D:getlastmodified/>
  </D:prop>
</D:propfind>`;

function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function localName(el: Element): string {
  return el.localName || el.tagName.replace(/^.*:/, "");
}

function childByLocal(parent: Element, name: string): Element | null {
  for (const el of Array.from(parent.children)) {
    if (localName(el) === name) return el;
  }
  return null;
}

function descendantsByLocal(parent: Element | Document, name: string): Element[] {
  return Array.from(parent.getElementsByTagName("*")).filter((el) => localName(el) === name);
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

export class WebDavProvider implements SyncProvider {
  readonly kind: ProviderKind = "webdav";
  private readonly auth: string;

  constructor(private readonly cfg: WebDavConfig) {
    this.auth = `Basic ${base64Utf8(`${cfg.username}:${cfg.password}`)}`;
  }

  private url(relPath: string): string {
    const base = this.cfg.server.replace(/\/+$/, "");
    const root = this.cfg.rootPath.replace(/\/+$/, "");
    const p = relPath.replace(/^\/+/, "");
    if (!root) return p ? `${base}/${p}` : `${base}/`;
    return p ? `${base}${root}/${p}` : `${base}${root}`;
  }

  private async req(
    relPath: string,
    options: { method: string; headers?: Record<string, string>; body?: ArrayBuffer | string },
  ): Promise<RequestUrlResponse> {
    try {
      return await requestUrl({
        url: this.url(relPath),
        method: options.method,
        headers: { Authorization: this.auth, ...(options.headers ?? {}) },
        body: options.body,
      });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      const where = `${options.method} ${relPath}`;
      if (status === 404) throw new ProviderError("not-found", `404 ${where}`);
      if (status === 401 || status === 403) throw new ProviderError("auth", `${status} ${where}`);
      if (status >= 500) throw new ProviderError("server", `${status} ${where}`);
      if (status > 0) throw new ProviderError("unknown", `${status} ${where}`);
      throw new ProviderError("network", `${where}: ${(e as Error).message ?? e}`);
    }
  }

  private hrefPrefix(): string {
    let serverPath: string;
    try {
      serverPath = new URL(this.cfg.server).pathname;
    } catch {
      serverPath = this.cfg.server;
    }
    const root = this.cfg.rootPath.replace(/^\/+|\/+$/g, "");
    return `${serverPath.replace(/\/+$/, "")}/${root}`.replace(/\/+$/, "");
  }

  private relativePath(href: string): string | null {
    let h = href.trim();
    if (h.startsWith("http://") || h.startsWith("https://")) {
      try {
        h = new URL(h).pathname;
      } catch {
        return null;
      }
    }
    const prefix = this.hrefPrefix();
    if (!h.startsWith(`${prefix}/`) && h !== prefix) return null;
    let rel = h.slice(prefix.length).replace(/^\/+/, "");
    try {
      rel = decodeURIComponent(rel);
    } catch {
      return rel;
    }
    return rel;
  }

  private parseMultistatus(xml: string): RemoteEntity[] {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const out: RemoteEntity[] = [];
    for (const response of descendantsByLocal(doc.documentElement, "response")) {
      const hrefEl = childByLocal(response, "href");
      if (!hrefEl?.textContent) continue;
      const rel = this.relativePath(hrefEl.textContent);
      if (rel === null) continue;
      const propstat = childByLocal(response, "propstat");
      const prop = propstat ? childByLocal(propstat, "prop") : null;
      const resourcetype = prop ? childByLocal(prop, "resourcetype") : null;
      const isFolder = resourcetype ? childByLocal(resourcetype, "collection") !== null : false;
      const lenEl = prop ? childByLocal(prop, "getcontentlength") : null;
      const modEl = prop ? childByLocal(prop, "getlastmodified") : null;
      const sizeEnc = lenEl?.textContent ? Number.parseInt(lenEl.textContent, 10) : 0;
      const mtimeSvr = modEl?.textContent ? Date.parse(modEl.textContent) : 0;
      out.push({
        path: rel,
        type: isFolder ? "folder" : "file",
        sizeEnc: isFolder ? 0 : sizeEnc,
        mtimeSvr,
      });
    }
    return out;
  }

  async checkConnect(): Promise<void> {
    await this.req("", {
      method: "PROPFIND",
      headers: { Depth: "0", "Content-Type": "application/xml" },
      body: PROPFIND_BODY,
    });
  }

  async walk(): Promise<RemoteEntity[]> {
    const resp = await this.req("", {
      method: "PROPFIND",
      headers: { Depth: "infinity", "Content-Type": "application/xml" },
      body: PROPFIND_BODY,
    });
    return this.parseMultistatus(resp.text).filter((e) => e.path !== "");
  }

  async stat(relPath: string): Promise<RemoteEntity | null> {
    try {
      const resp = await this.req(relPath, {
        method: "PROPFIND",
        headers: { Depth: "0", "Content-Type": "application/xml" },
        body: PROPFIND_BODY,
      });
      return this.parseMultistatus(resp.text).find((e) => e.path === relPath) ?? null;
    } catch (e) {
      if (e instanceof ProviderError && e.kind === "not-found") return null;
      throw e;
    }
  }

  async readFile(relPath: string): Promise<Uint8Array> {
    const resp = await this.req(relPath, { method: "GET" });
    return new Uint8Array(resp.arrayBuffer);
  }

  async writeFile(relPath: string, data: Uint8Array): Promise<RemoteEntity> {
    await this.req(relPath, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: toArrayBuffer(data),
    });
    const st = await this.stat(relPath);
    if (!st) throw new ProviderError("unknown", `stat missing after write: ${relPath}`);
    return st;
  }

  async mkdir(relPath: string): Promise<void> {
    try {
      await this.req(relPath, { method: "MKCOL" });
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (
        e instanceof ProviderError &&
        (e.kind === "unknown" || e.kind === "not-found") &&
        /40[59]/.test(msg)
      )
        return;
      throw e;
    }
  }

  async rm(relPath: string): Promise<void> {
    try {
      await this.req(relPath, { method: "DELETE" });
    } catch (e) {
      if (e instanceof ProviderError && e.kind === "not-found") return;
      throw e;
    }
  }

  async getUserDisplayName(): Promise<string | null> {
    return this.cfg.username || null;
  }

  async listRootFolders(): Promise<string[]> {
    return [];
  }
}
