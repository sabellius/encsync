import { describe, expect, it } from "vitest";
import { checkDeletionPercent, checkEmptyRemote, checkWrongPassword } from "./guards";

describe("checkEmptyRemote", () => {
  it("passes when both remote and baseline are empty", () => {
    const result = checkEmptyRemote(0, 0);
    expect(result.ok).toBe(true);
  });

  it("passes when remote has files and baseline is empty", () => {
    const result = checkEmptyRemote(5, 0);
    expect(result.ok).toBe(true);
  });

  it("passes when remote has files and baseline has entries", () => {
    const result = checkEmptyRemote(5, 10);
    expect(result.ok).toBe(true);
  });

  it("aborts when remote is empty but baseline has entries", () => {
    const result = checkEmptyRemote(0, 10);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Remote is empty");
    }
  });
});

describe("checkDeletionPercent", () => {
  it("passes when baseline is empty", () => {
    const result = checkDeletionPercent(0, 0, 20);
    expect(result.ok).toBe(true);
  });

  it("passes when deletions are below threshold", () => {
    const result = checkDeletionPercent(5, 100, 20);
    expect(result.ok).toBe(true);
  });

  it("aborts when deletions equal threshold", () => {
    const result = checkDeletionPercent(20, 100, 20);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("20 of 100");
    }
  });

  it("aborts when deletions exceed threshold", () => {
    const result = checkDeletionPercent(50, 100, 20);
    expect(result.ok).toBe(false);
  });

  it("aborts on small vaults where 1 deletion trips the guard", () => {
    const result = checkDeletionPercent(1, 5, 20);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("1 of 5");
    }
  });
});

describe("checkWrongPassword", () => {
  it("passes when no undecryptable files", () => {
    const result = checkWrongPassword(0, 10);
    expect(result.ok).toBe(true);
  });

  it("passes when minority of files are undecryptable", () => {
    const result = checkWrongPassword(1, 10);
    expect(result.ok).toBe(true);
  });

  it("aborts when majority of files are undecryptable", () => {
    const result = checkWrongPassword(6, 10);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("6 of 10 remote entries");
    }
  });

  it("aborts when all files are undecryptable", () => {
    const result = checkWrongPassword(3, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("3 of 3 remote entries");
    }
  });

  it("passes when remote is empty", () => {
    const result = checkWrongPassword(0, 0);
    expect(result.ok).toBe(true);
  });
});
