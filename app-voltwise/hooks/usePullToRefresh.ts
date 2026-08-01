import { useCallback, useRef, useState } from "react";

// Keeps the refresh spinner visible at least this long so a fast (cached/local)
// response doesn't read as a flicker instead of a completed refresh.
const MIN_VISIBLE_MS = 600;

/**
 * Screen-agnostic refresh state machine: wraps an async fetch function with
 * a `refreshing` flag, re-entrancy guard, and a minimum visible duration.
 * Has no knowledge of gestures or UI — pair it with <PullToRefresh /> (or any
 * other trigger, e.g. a manual "Refresh" button) via the returned `onRefresh`.
 */
export function usePullToRefresh(refresh: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const runningRef = useRef(false);

  const onRefresh = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRefreshing(true);
    const startedAt = Date.now();

    Promise.resolve()
      .then(refresh)
      .catch(() => {
        // Offline-first: a failed refresh just keeps showing the last data.
      })
      .finally(() => {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
        setTimeout(() => {
          setRefreshing(false);
          runningRef.current = false;
        }, remaining);
      });
  }, [refresh]);

  return { refreshing, onRefresh };
}
