import type { MockVault } from "./vault";

export class MockApp {
  fileManager = {
    trashFile: async (file: { path: string }): Promise<void> => {
      this.vault.trashFile(file.path);
    },
  };

  constructor(private readonly vault: MockVault) {}
}
