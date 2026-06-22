/* Pure, UI-free helpers for the slides editor's save path. Kept in their own
   module (no JSX) so they can be unit-tested in isolation. */

/* Is there work the teacher could lose by closing the tab right now? True while a
   save is in flight, has failed, or a debounce timer is pending — used to arm the
   beforeunload guard. */
export function hasUnsavedWork({ save, pendingTimer }: { save: string; pendingTimer: boolean }): boolean {
  return save === "saving" || save === "error" || pendingTimer;
}

/* Read a deck's current updated_at, retrying a transient read failure a couple of
   times before giving up. Returns { ok, updatedAt }. ok=false means every attempt
   threw — the caller must NOT treat that as "no conflict" and overwrite. */
export async function readUpdatedAtWithRetry(
  read: () => Promise<{ updated_at?: string } | null>,
  attempts = 3,
): Promise<{ ok: boolean; updatedAt: string | null }> {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const cur = await read();
      return { ok: true, updatedAt: cur?.updated_at ?? null };
    } catch (e) { lastErr = e; }
  }
  void lastErr;
  return { ok: false, updatedAt: null };
}

/* How long to wait before the next autosave retry (exponential backoff, capped).
   attempt is 0-based for the first retry. */
export function retryDelayMs(attempt: number, base = 1500, cap = 30000): number {
  return Math.min(cap, base * Math.pow(2, attempt));
}
