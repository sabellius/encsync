import { type RequestUrlResponse, requestUrl } from "obsidian";
import type { ProviderKind } from "../types";
import { ProviderError, type RemoteEntity, type SyncProvider } from "./base";

export const DEFAULT_KOOFR_CLIENT_ID = "4TZ3AD7XDFC52A5FPVX3E72OU6ACRIV2";
export const KOOFR_AUTH_URL = "https://app.koofr.net/oauth2/auth";
export const KOOFR_SCOPE = "public";

export interface KoofrConfig {
  clientId: string;
  accessToken: string;
  hostname: string;
  rootPath: string;
}

export function defaultKoofrConfig(): KoofrConfig {
  return {
    clientId: DEFAULT_KOOFR_CLIENT_ID,
    accessToken: "",
    hostname: "https://app.koofr.net",
    rootPath: "/EncSync",
  };
}

export function isKoofrConfigured(config: KoofrConfig | null): boolean {
  return !!config && config.accessToken !== "";
}

interface KoofrFile {
  name: string;
  type: string;
  size?: number;
  modified?: number | string;
}

interface KoofrPlace {
  id: string;
  name: string;
  isPrimary: boolean;
}

export class KoofrProvider implements SyncProvider {
  readonly kind: ProviderKind = "koofr";
  private mountIdCache: string | null = null;

  constructor(private readonly config: KoofrConfig) {}

  private apiUrl(path: string): string {
    const base = this.config.hostname.replace(/\/+$/, "");
    return `${base}/api/v2${path}`;
  }

  private contentUrl(path: string): string {
    const base = this.config.hostname.replace(/\/+$/, "");
    return `${base}/content/api/v2${path}`;
  }

  private fullKoofrPath(encPath: string): string {
    const root = this.config.rootPath.replace(/^\/+|\/+$/g, "");
    if (!encPath) return root ? `/${root}` : "/";
    return root ? `/${root}/${encPath}` : `/${encPath}`;
  }

  private splitPath(fullPath: string): { parent: string; name: string } {
    const parts = fullPath.replace(/\/+$/, "").split("/").filter(Boolean);
    const name = parts.pop() ?? "";
    const parent = parts.length > 0 ? `/${parts.join("/")}` : "/";
    return { parent, name };
  }

  private parseModified(value: number | string | undefined): number {
    if (value === undefined) return 0;
    if (typeof value === "number") return value;
    const parsed = Date.parse(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  private async getMountId(): Promise<string> {
    if (this.mountIdCache) return this.mountIdCache;
    const response = await this.request(this.apiUrl("/places"), { method: "GET" });
    const data = response.json as { places?: KoofrPlace[] };
    const places = data.places ?? [];
    const primary = places.find((p) => p.isPrimary);
    if (!primary) throw new ProviderError("unknown", "no primary mount found");
    this.mountIdCache = primary.id;
    return this.mountIdCache;
  }

  private async request(
    url: string,
    options: {
      method: string;
      headers?: Record<string, string>;
      body?: ArrayBuffer | string;
    },
  ): Promise<RequestUrlResponse> {
    try {
      return await requestUrl({
        url,
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          ...(options.headers ?? {}),
        },
        body: options.body,
      });
    } catch (error) {
      const status = (error as { status?: number }).status ?? 0;
      if (status === 404) throw new ProviderError("not-found", `404`, status);
      if (status === 401 || status === 403) throw new ProviderError("auth", `${status}`, status);
      if (status >= 500) throw new ProviderError("server", `${status}`, status);
      if (status > 0) throw new ProviderError("unknown", `${status}`, status);
      throw new ProviderError("network", (error as Error).message ?? String(error));
    }
  }

  async checkConnect(): Promise<void> {
    await this.request(this.apiUrl("/user"), { method: "GET" });
  }

  async getUserDisplayName(): Promise<string | null> {
    const response = await this.request(this.apiUrl("/user"), { method: "GET" });
    const data = response.json as { email?: string; name?: string };
    return data.email ?? data.name ?? null;
  }

  async listRootFolders(): Promise<string[]> {
    return [];
  }

  async ensureRoot(): Promise<void> {
    const mountId = await this.getMountId();
    const segments = this.config.rootPath.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      const parent = current || "/";
      current = current ? `${current}/${segment}` : `/${segment}`;
      try {
        await this.request(
          this.apiUrl(`/mounts/${mountId}/files/folder?path=${encodeURIComponent(parent)}`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: segment }),
          },
        );
      } catch (error) {
        if (
          error instanceof ProviderError &&
          (error.kind === "unknown" || error.kind === "server")
        ) {
          // Folder likely already exists — swallow
        } else {
          throw error;
        }
      }
    }
  }

  async walk(): Promise<RemoteEntity[]> {
    const mountId = await this.getMountId();
    const results: RemoteEntity[] = [];
    await this.walkRecursive(mountId, this.config.rootPath, "", results);
    return results;
  }

  private async walkRecursive(
    mountId: string,
    absPath: string,
    relPath: string,
    results: RemoteEntity[],
  ): Promise<void> {
    const url = this.apiUrl(`/mounts/${mountId}/files/list?path=${encodeURIComponent(absPath)}`);
    const response = await this.request(url, { method: "GET" });
    const data = response.json as { files?: KoofrFile[] };
    const files = data.files ?? [];
    for (const file of files) {
      const childRel = relPath ? `${relPath}/${file.name}` : file.name;
      const isFolder = file.type === "dir" || file.type === "folder";
      if (!isFolder) {
        results.push({
          path: childRel,
          type: "file",
          sizeEnc: file.size ?? 0,
          mtimeServer: this.parseModified(file.modified),
        });
      } else {
        const childAbs = `${absPath}/${file.name}`.replace(/\/+/g, "/");
        await this.walkRecursive(mountId, childAbs, childRel, results);
      }
    }
  }

  async stat(encPath: string): Promise<RemoteEntity | null> {
    const mountId = await this.getMountId();
    const fullPath = this.fullKoofrPath(encPath);
    try {
      const url = this.apiUrl(`/mounts/${mountId}/files/info?path=${encodeURIComponent(fullPath)}`);
      const response = await this.request(url, { method: "GET" });
      const file = response.json as KoofrFile;
      return {
        path: encPath,
        type: "file",
        sizeEnc: file.size ?? 0,
        mtimeServer: this.parseModified(file.modified),
      };
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "not-found") return null;
      throw error;
    }
  }

  async readFile(encPath: string): Promise<Uint8Array> {
    const mountId = await this.getMountId();
    const fullPath = this.fullKoofrPath(encPath);
    const url = this.contentUrl(
      `/mounts/${mountId}/files/get?path=${encodeURIComponent(fullPath)}`,
    );
    const response = await this.request(url, { method: "GET" });
    return new Uint8Array(response.arrayBuffer);
  }

  async writeFile(encPath: string, data: Uint8Array): Promise<RemoteEntity> {
    const mountId = await this.getMountId();
    const fullPath = this.fullKoofrPath(encPath);
    const { parent, name } = this.splitPath(fullPath);

    const boundary = `----EncSync${Date.now()}`;
    const encoder = new TextEncoder();
    const header = encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    );
    const footer = encoder.encode(`\r\n--${boundary}--\r\n`);
    const body = new Uint8Array(header.length + data.length + footer.length);
    body.set(header, 0);
    body.set(data, header.length);
    body.set(footer, header.length + data.length);

    const uploadUrl = this.contentUrl(
      `/mounts/${mountId}/files/put?path=${encodeURIComponent(parent)}&filename=${encodeURIComponent(name)}&info=true`,
    );
    await this.request(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: body.buffer,
    });

    const result = await this.stat(encPath);
    if (!result) throw new ProviderError("unknown", `stat missing after write: ${encPath}`);
    return result;
  }

  async mkdir(encPath: string): Promise<void> {
    const mountId = await this.getMountId();
    const fullPath = this.fullKoofrPath(encPath);
    const { parent, name } = this.splitPath(fullPath);
    try {
      await this.request(
        this.apiUrl(`/mounts/${mountId}/files/folder?path=${encodeURIComponent(parent)}`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
    } catch (error) {
      if (error instanceof ProviderError && (error.kind === "unknown" || error.kind === "server")) {
        return;
      }
      throw error;
    }
  }

  async rm(encPath: string): Promise<void> {
    const mountId = await this.getMountId();
    const fullPath = this.fullKoofrPath(encPath);
    try {
      await this.request(
        this.apiUrl(`/mounts/${mountId}/files/remove?path=${encodeURIComponent(fullPath)}`),
        { method: "POST" },
      );
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "not-found") return;
      throw error;
    }
  }
}
