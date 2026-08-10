import { describe, expect, it } from "vitest";
import { conflictPath } from "./conflict";

describe("conflictPath", () => {
  const fixedTime = new Date(2026, 7, 9, 14, 30, 22);

  it("inserts conflict marker before extension", () => {
    expect(conflictPath("notes/foo.md", fixedTime)).toBe("notes/foo (conflict 20260809-143022).md");
  });

  it("handles files without extension", () => {
    expect(conflictPath("notes/README", fixedTime)).toBe("notes/README (conflict 20260809-143022)");
  });

  it("handles files in nested directories", () => {
    expect(conflictPath("a/b/c/photo.png", fixedTime)).toBe(
      "a/b/c/photo (conflict 20260809-143022).png",
    );
  });

  it("handles dotfiles as having no extension", () => {
    expect(conflictPath(".gitignore", fixedTime)).toBe(".gitignore (conflict 20260809-143022)");
  });

  it("handles files in root directory", () => {
    expect(conflictPath("file.md", fixedTime)).toBe("file (conflict 20260809-143022).md");
  });

  it("pads single-digit date components", () => {
    const earlyTime = new Date(2026, 0, 5, 3, 7, 9);
    expect(conflictPath("f.md", earlyTime)).toBe("f (conflict 20260105-030709).md");
  });

  it("throws on empty path", () => {
    expect(() => conflictPath("", fixedTime)).toThrow("path must not be empty");
  });

  it("uses current time when no timestamp provided", () => {
    const result = conflictPath("test.md");
    expect(result).toMatch(/test \(conflict \d{8}-\d{6}\)\.md/);
  });
});
