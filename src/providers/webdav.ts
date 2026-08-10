import { type RequestUrlResponse, requestUrl } from "obsidian";
import type { ProviderKind } from "../types";
import { ProviderError, type RemoteEntity, type SyncProvider } from "./base";
import { base64Utf8, childByLocal, descendantsByLocal, toArrayBuffer } from "./webdav-utils";

export interface WebDavConfig {
  server: string;
  username: string;
  password: string;
  rootPath: string;
}

export function defaultWebDavConfig(): WebDavConfig {
  return { server: "", username: "", password: "", rootPath: "/EncSync" };
}

export function isWebDavConfigured(config: WebDavConfig | null): boolean {
  return !!config && config.server.trim() !== "" && config.username.trim() !== "";
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:getcontentlength/>
    <D:getlastmodified/>
  </D:prop>
</D:propfind>`;

export class WebDavProvider implements SyncProvider {
  readonly kind: ProviderKind = "webdav";
  private readonly auth: string;

  constructor(private readonly config: WebDavConfig) {
    this.auth = `Basic ${base64Utf8(`${config.username}:${config.password}`)}`;
  }

  private url(relPath: string): string {
    const base = this.config.server.replace(/\/+$/, "");
    const root = this.config.rootPath.replace(/\/+$/, "");
    const path = relPath.replace(/^\/+/, "");
    if (!root) return path ? `${base}/${path}` : `${base}/`;
    return path ? `${base}${root}/${path}` : `${base}${root}`;
  }

  private async request(
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
    } catch (error) {
      const status = (error as { status?: number }).status ?? 0;
      const where = `${options.method} ${relPath}`;
      if (status === 404) throw new ProviderError("not-found", `404 ${where}`, status);
      if (status === 401 || status === 403)
        throw new ProviderError("auth", `${status} ${where}`, status);
      if (status >= 500) throw new ProviderError("server", `${status} ${where}`, status);
      if (status > 0) throw new ProviderError("unknown", `${status} ${where}`, status);
      throw new ProviderError("network", `${where}: ${(error as Error).message ?? error}`);
    }
  }

  private hrefPrefix(): string {
    let serverPath: string;
    try {
      serverPath = new URL(this.config.server).pathname;
    } catch {
      serverPath = this.config.server;
    }
    const root = this.config.rootPath.replace(/^\/+|\/+$/g, "");
    return `${serverPath.replace(/\/+$/, "")}/${root}`.replace(/\/+$/, "");
  }

  private relativePath(href: string): string | null {
    let hrefPath = href.trim();
    if (hrefPath.startsWith("http://") || hrefPath.startsWith("https://")) {
      try {
        hrefPath = new URL(hrefPath).pathname;
      } catch {
        return null;
      }
    }
    const prefix = this.hrefPrefix();
    if (!hrefPath.startsWith(`${prefix}/`) && hrefPath !== prefix) return null;
    let relative = hrefPath.slice(prefix.length).replace(/^\/+/, "");
    try {
      relative = decodeURIComponent(relative);
    } catch {
      return relative;
    }
    return relative;
  }

  private parseMultistatus(xml: string): RemoteEntity[] {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const entries: RemoteEntity[] = [];
    for (const response of descendantsByLocal(doc.documentElement, "response")) {
      const hrefElement = childByLocal(response, "href");
      if (!hrefElement?.textContent) continue;
      const relative = this.relativePath(hrefElement.textContent);
      if (relative === null) continue;
      const propstat = childByLocal(response, "propstat");
      const prop = propstat ? childByLocal(propstat, "prop") : null;
      const resourcetype = prop ? childByLocal(prop, "resourcetype") : null;
      const isFolder = resourcetype ? childByLocal(resourcetype, "collection") !== null : false;
      const lengthElement = prop ? childByLocal(prop, "getcontentlength") : null;
      const modifiedElement = prop ? childByLocal(prop, "getlastmodified") : null;
      const sizeEnc = lengthElement?.textContent
        ? Number.parseInt(lengthElement.textContent, 10)
        : 0;
      const mtimeServer = modifiedElement?.textContent
        ? Date.parse(modifiedElement.textContent)
        : 0;
      entries.push({
        path: relative,
        type: isFolder ? "folder" : "file",
        sizeEnc: isFolder ? 0 : sizeEnc,
        mtimeServer,
      });
    }
    return entries;
  }

  async checkConnect(): Promise<void> {
    await this.request("", {
      method: "PROPFIND",
      headers: { Depth: "0", "Content-Type": "application/xml" },
      body: PROPFIND_BODY,
    });
  }

  async walk(): Promise<RemoteEntity[]> {
    const response = await this.request("", {
      method: "PROPFIND",
      headers: { Depth: "infinity", "Content-Type": "application/xml" },
      body: PROPFIND_BODY,
    });
    return this.parseMultistatus(response.text).filter((entry) => entry.path !== "");
  }

  async stat(relPath: string): Promise<RemoteEntity | null> {
    try {
      const response = await this.request(relPath, {
        method: "PROPFIND",
        headers: { Depth: "0", "Content-Type": "application/xml" },
        body: PROPFIND_BODY,
      });
      return this.parseMultistatus(response.text).find((entry) => entry.path === relPath) ?? null;
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "not-found") return null;
      throw error;
    }
  }

  async readFile(relPath: string): Promise<Uint8Array> {
    const response = await this.request(relPath, { method: "GET" });
    return new Uint8Array(response.arrayBuffer);
  }

  async writeFile(relPath: string, data: Uint8Array): Promise<RemoteEntity> {
    await this.request(relPath, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: toArrayBuffer(data),
    });
    const statResult = await this.stat(relPath);
    if (!statResult) throw new ProviderError("unknown", `stat missing after write: ${relPath}`);
    return statResult;
  }

  async mkdir(relPath: string): Promise<void> {
    try {
      await this.request(relPath, { method: "MKCOL" });
    } catch (error) {
      if (error instanceof ProviderError && (error.status === 405 || error.status === 409)) return;
      throw error;
    }
  }

  async ensureRoot(): Promise<void> {
    await this.mkdir("");
  }

  async rm(relPath: string): Promise<void> {
    try {
      await this.request(relPath, { method: "DELETE" });
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "not-found") return;
      throw error;
    }
  }

  async getUserDisplayName(): Promise<string | null> {
    return this.config.username || null;
  }

  async listRootFolders(): Promise<string[]> {
    return [];
  }
}
