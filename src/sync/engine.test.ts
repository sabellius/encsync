import type { App, Vault } from "obsidian";
import { beforeAll, describe, expect, it } from "vitest";
import { CryptoLayer } from "../crypto/encrypt";
import type { RemoteEntity } from "../providers/base";
import { FakeBaselineStore } from "../test/fakes/fake-baseline";
import { FakeProvider } from "../test/fakes/fake-provider";
import { MockApp } from "../test/mocks/app";
import { MockVault } from "../test/mocks/vault";
import { DEFAULT_SETTINGS, type EncSyncSettings, type FileBaselineEntry } from "../types";
import { SyncEngine } from "./engine";

const PASSWORD = "test-password";
let crypto: CryptoLayer;

beforeAll(async () => {
  crypto = await CryptoLayer.create(PASSWORD);
});

function makeSettings(overrides: Partial<EncSyncSettings> = {}): EncSyncSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function addRemoteFile(
  provider: FakeProvider,
  vaultPath: string,
  content: string,
  mtime = Date.now(),
): Promise<RemoteEntity> {
  const encPath = await crypto.encryptPath(vaultPath);
  const ciphertext = await crypto.encryptData(textToBytes(content));
  return provider.writeFile(encPath, ciphertext);
}

function makeBaselineEntry(
  path: string,
  content: string,
  remote: RemoteEntity,
  mtimeClient = Date.now(),
): FileBaselineEntry {
  return {
    type: "file",
    key: path,
    mtimeClient,
    mtimeServer: remote.mtimeServer,
    size: textToBytes(content).byteLength,
    sizeEnc: remote.sizeEnc,
    hash: crypto.hash(textToBytes(content)),
  };
}

function createEngine(
  vault: MockVault,
  provider: FakeProvider,
  baseline: FakeBaselineStore,
  settings = makeSettings(),
): SyncEngine {
  return new SyncEngine(
    new MockApp(vault) as unknown as App,
    vault as unknown as Vault,
    provider,
    crypto,
    baseline,
    settings,
  );
}

describe("SyncEngine matrix — new files", () => {
  it("pushes a new local file to remote", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    vault.addFile("notes/new.md", "hello world");

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pushed).toBe(1);
    expect(baseline.has("notes/new.md")).toBe(true);
    expect(vault.getFileContent("notes/new.md")).toBe("hello world");
  });

  it("pulls a new remote file to local", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    await addRemoteFile(provider, "notes/remote.md", "from cloud");

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pulled).toBe(1);
    expect(vault.getFileContent("notes/remote.md")).toBe("from cloud");
    expect(baseline.has("notes/remote.md")).toBe(true);
  });
});

describe("SyncEngine matrix — unchanged", () => {
  it("skips files that are unchanged on both sides", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    const content = "unchanged content";
    const mtime = Date.now();
    vault.addFile("same.md", content, mtime);
    const remote = await addRemoteFile(provider, "same.md", content);
    await baseline.set("same.md", makeBaselineEntry("same.md", content, remote, mtime));

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.skipped).toBe(1);
    expect(result.pushed).toBe(0);
    expect(result.pulled).toBe(0);
  });
});

describe("SyncEngine — local change detection", () => {
  it("treats file as unchanged when mtime within tolerance and size matches", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    const content = "same content";
    const baseTime = Date.now();
    vault.addFile("file.md", content, baseTime);
    const remote = await addRemoteFile(provider, "file.md", content);
    await baseline.set("file.md", makeBaselineEntry("file.md", content, remote, baseTime + 1000));

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.skipped).toBe(1);
  });

  it("treats file as unchanged when mtime differs but hash matches", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    const content = "same content";
    vault.addFile("file.md", content, Date.now());
    const remote = await addRemoteFile(provider, "file.md", content);
    await baseline.set(
      "file.md",
      makeBaselineEntry("file.md", content, remote, Date.now() - 10000),
    );

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.skipped).toBe(1);
  });

  it("treats file as changed when mtime differs and hash differs", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    vault.addFile("file.md", "new content", Date.now());
    const remote = await addRemoteFile(provider, "file.md", "new content");
    await baseline.set(
      "file.md",
      makeBaselineEntry("file.md", "old content", remote, Date.now() - 10000),
    );

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pushed).toBe(1);
  });

  it("treats file as changed when size differs", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    vault.addFile("file.md", "longer content now", Date.now());
    const remote = await addRemoteFile(provider, "file.md", "longer content now");
    await baseline.set("file.md", makeBaselineEntry("file.md", "short", remote, Date.now()));

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pushed).toBe(1);
  });
});

describe("SyncEngine — remote change detection", () => {
  it("treats file as changed when remote sizeEnc differs from baseline", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    const content = "same local";
    vault.addFile("file.md", content, Date.now());
    await addRemoteFile(provider, "file.md", "different remote");
    await baseline.set("file.md", {
      ...makeBaselineEntry("file.md", content, {
        path: "x",
        type: "file",
        sizeEnc: 999,
        mtimeServer: 0,
      }),
    });

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pulled).toBe(1);
  });

  it("treats file as changed when remote mtimeServer differs from baseline", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    const content = "same content";
    const mtime = Date.now();
    vault.addFile("file.md", content, mtime);
    const remote = await addRemoteFile(provider, "file.md", content);
    await baseline.set("file.md", {
      ...makeBaselineEntry("file.md", content, { ...remote, mtimeServer: 0 }),
    });

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pulled).toBe(1);
  });
});

describe("SyncEngine matrix — local changed", () => {
  it("pushes when local file changed but remote is unchanged", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    const oldContent = "old content";
    const newContent = "new content";
    const oldMtime = Date.now() - 10000;

    vault.addFile("changed.md", newContent, Date.now());
    const remote = await addRemoteFile(provider, "changed.md", oldContent);
    await baseline.set("changed.md", makeBaselineEntry("changed.md", oldContent, remote, oldMtime));

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pushed).toBe(1);
    const encPath = await crypto.encryptPath("changed.md");
    const remoteData = provider.getFileData(encPath);
    expect(remoteData).toBeDefined();
    const decrypted = await crypto.decryptData(remoteData!);
    expect(new TextDecoder().decode(decrypted)).toBe(newContent);
  });
});

describe("SyncEngine matrix — remote changed", () => {
  it("pulls when remote file changed but local is unchanged", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    const oldContent = "old content";
    const newContent = "new content";
    const localMtime = Date.now();

    vault.addFile("changed.md", oldContent, localMtime);
    const remote = await addRemoteFile(provider, "changed.md", newContent);
    const entry = makeBaselineEntry("changed.md", oldContent, remote, localMtime);
    entry.sizeEnc = 0;
    entry.mtimeServer = 0;
    await baseline.set("changed.md", entry);

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pulled).toBe(1);
    expect(vault.getFileContent("changed.md")).toBe(newContent);
  });
});

describe("SyncEngine matrix — both changed", () => {
  it("creates a conflict copy when both sides changed", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    const oldContent = "original";
    const localContent = "local edit";
    const remoteContent = "remote edit";

    vault.addFile("both.md", localContent, Date.now());
    await addRemoteFile(provider, "both.md", remoteContent);
    const oldRemote = { path: "x", type: "file" as const, sizeEnc: 999, mtimeServer: 1000 };
    await baseline.set(
      "both.md",
      makeBaselineEntry("both.md", oldContent, oldRemote, Date.now() - 10000),
    );

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.conflicts).toBe(1);

    expect(vault.getFileContent("both.md")).toBe(remoteContent);
    expect(vault.getTrashed()).not.toContain("both.md");

    const conflictFiles = vault.getFiles().filter((f) => f.path.includes("conflict"));
    expect(conflictFiles.length).toBe(1);
    const conflictContent = vault.getFileContent(conflictFiles[0]?.path ?? "");
    expect(conflictContent).toBe(localContent);
  });
});

describe("SyncEngine matrix — deletions", () => {
  it("deletes local file when remote deleted it", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    vault.addFile("deleted.md", "content", Date.now());
    vault.addFile("keeper.md", "keep me");
    const keeperRemote = await addRemoteFile(provider, "keeper.md", "keep me");
    await baseline.set("keeper.md", makeBaselineEntry("keeper.md", "keep me", keeperRemote));
    await baseline.set(
      "deleted.md",
      makeBaselineEntry("deleted.md", "content", {
        path: "x",
        type: "file",
        sizeEnc: 999,
        mtimeServer: 1000,
      }),
    );

    const result = await createEngine(
      vault,
      provider,
      baseline,
      makeSettings({ deletionGuardPct: 100 }),
    ).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.deletedLocal).toBe(1);
    expect(vault.getTrashed()).toContain("deleted.md");
    expect(baseline.has("deleted.md")).toBe(false);
  });

  it("deletes remote file when local deleted it", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    vault.addFile("keeper.md", "keep me");
    const keeperRemote = await addRemoteFile(provider, "keeper.md", "keep me");
    await baseline.set("keeper.md", makeBaselineEntry("keeper.md", "keep me", keeperRemote));
    const deletedRemote = await addRemoteFile(provider, "deleted.md", "content");
    await baseline.set("deleted.md", makeBaselineEntry("deleted.md", "content", deletedRemote));

    const result = await createEngine(
      vault,
      provider,
      baseline,
      makeSettings({ deletionGuardPct: 100 }),
    ).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.deletedRemote).toBe(1);
    const encPath = await crypto.encryptPath("deleted.md");
    expect(provider.hasFile(encPath)).toBe(false);
    expect(baseline.has("deleted.md")).toBe(false);
  });

  it("drops baseline entry when file is absent on both sides", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    vault.addFile("keeper.md", "keep me");
    const keeperRemote = await addRemoteFile(provider, "keeper.md", "keep me");
    await baseline.set("keeper.md", makeBaselineEntry("keeper.md", "keep me", keeperRemote));
    await baseline.set(
      "gone.md",
      makeBaselineEntry("gone.md", "x", {
        path: "x",
        type: "file",
        sizeEnc: 0,
        mtimeServer: 0,
      }),
    );

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(baseline.has("gone.md")).toBe(false);
  });
});

describe("SyncEngine — first-sync reconciliation", () => {
  it("seeds baseline when both sides have identical content", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    const content = "same everywhere";
    vault.addFile("shared.md", content);
    await addRemoteFile(provider, "shared.md", content);

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.skipped).toBe(1);
    expect(result.pushed).toBe(0);
    expect(result.pulled).toBe(0);
    expect(baseline.has("shared.md")).toBe(true);
  });

  it("conflicts when both sides have different content on first sync", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    vault.addFile("shared.md", "local version");
    await addRemoteFile(provider, "shared.md", "remote version");

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.conflicts).toBe(1);
    expect(vault.getFileContent("shared.md")).toBe("remote version");
  });
});

describe("SyncEngine — guards", () => {
  it("aborts when remote is empty but baseline has entries", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    await baseline.set(
      "file.md",
      makeBaselineEntry("file.md", "x", {
        path: "x",
        type: "file",
        sizeEnc: 0,
        mtimeServer: 0,
      }),
    );

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("aborted");
    if (result.status === "aborted") {
      expect(result.reason).toContain("Remote is empty");
    }
  });

  it("aborts when deletion percentage exceeds threshold", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    for (let i = 0; i < 10; i++) {
      const path = `file${i}.md`;
      vault.addFile(path, "content");
      const remote = await addRemoteFile(provider, path, "content");
      await baseline.set(path, makeBaselineEntry(path, "content", remote));
    }

    vault.removeFile("file0.md");
    vault.removeFile("file1.md");
    vault.removeFile("file2.md");

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("aborted");
    if (result.status === "aborted") {
      expect(result.reason).toContain("guard threshold");
    }
  });
});

describe("SyncEngine — error isolation", () => {
  it("continues processing other files when one push fails", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    vault.addFile("good.md", "hello");
    vault.addFile("bad.md", "world");

    const badEncPath = await crypto.encryptPath("bad.md");
    const originalWriteFile = provider.writeFile.bind(provider);
    provider.writeFile = async (path: string, data: Uint8Array) => {
      if (path === badEncPath) throw new Error("write failed");
      return originalWriteFile(path, data);
    };

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.errors.length).toBe(1);
    expect(result.pushed).toBe(1);
    expect(baseline.has("good.md")).toBe(true);
    expect(baseline.has("bad.md")).toBe(false);
  });
});

describe("SyncEngine — ignorePaths", () => {
  it("excludes files under ignored path prefixes", async () => {
    const vault = new MockVault();
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    vault.addFile("notes/keep.md", "sync me");
    vault.addFile("templates/skip.md", "ignore me");

    const result = await createEngine(
      vault,
      provider,
      baseline,
      makeSettings({ ignorePaths: ["templates"] }),
    ).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pushed).toBe(1);
    expect(baseline.has("notes/keep.md")).toBe(true);
    expect(baseline.has("templates/skip.md")).toBe(false);
  });

  it("excludes files under configDir", async () => {
    const vault = new MockVault();
    vault.configDir = ".obsidian";
    const provider = new FakeProvider();
    const baseline = new FakeBaselineStore();

    vault.addFile(".obsidian/plugins/test/data.json", "config");
    vault.addFile("note.md", "real content");

    const result = await createEngine(vault, provider, baseline).run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.pushed).toBe(1);
    expect(baseline.has("note.md")).toBe(true);
    expect(baseline.has(".obsidian/plugins/test/data.json")).toBe(false);
  });
});
