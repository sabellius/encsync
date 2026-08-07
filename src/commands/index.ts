import type EncSyncPlugin from "../main";
import { runTestRoundTrip } from "./test-roundtrip";

export function registerCommands(plugin: EncSyncPlugin): void {
  plugin.addCommand({
    id: "test-roundtrip",
    name: "Test sync round-trip (upload and download the active note)",
    callback: () => {
      void runTestRoundTrip(plugin);
    },
  });
}
