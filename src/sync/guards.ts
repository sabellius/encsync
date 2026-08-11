export type GuardResult = { ok: true } | { ok: false; reason: string };

export function checkEmptyRemote(remoteCount: number, baselineSize: number): GuardResult {
  if (remoteCount === 0 && baselineSize > 0) {
    return {
      ok: false,
      reason:
        "Remote is empty but the baseline has entries. This usually means a connection or authentication problem, not real deletions. Sync aborted.",
    };
  }
  return { ok: true };
}

export function checkDeletionPercent(
  plannedFileDeletions: number,
  baselineFileCount: number,
  thresholdPct: number,
): GuardResult {
  if (baselineFileCount === 0) return { ok: true };

  const pct = (plannedFileDeletions / baselineFileCount) * 100;
  if (pct >= thresholdPct) {
    return {
      ok: false,
      reason: `This sync would delete ${plannedFileDeletions} of ${baselineFileCount} files (${pct.toFixed(0)}%), which meets or exceeds the ${thresholdPct}% guard threshold. Sync aborted. Adjust the deletion guard in settings if this is intentional.`,
    };
  }
  return { ok: true };
}

export function checkWrongPassword(undecryptableCount: number, remoteCount: number): GuardResult {
  if (remoteCount > 0 && undecryptableCount / remoteCount >= 0.5) {
    const entryWord = undecryptableCount === 1 ? "entry" : "entries";
    return {
      ok: false,
      reason: `${undecryptableCount} of ${remoteCount} remote ${entryWord} could not be decrypted. Check your encryption password. Sync aborted.`,
    };
  }
  return { ok: true };
}
