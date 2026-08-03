/**
 * How sessions read on the Privacy & Security screen.
 *
 * Pure and separate from the screen for the usual reason in this codebase: the
 * wording is the feature. "Active now" versus "3 days ago" is what someone
 * actually uses to decide whether a listed device is theirs, so the thresholds
 * that produce those words deserve to be looked at on their own — and tested
 * without rendering anything.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Anything used this recently is described as active rather than given a
 * number. A session that pinged the API forty seconds ago is, for the purpose
 * of "is this device signed in right now?", simply on.
 */
const ACTIVE_WINDOW_MS = 2 * MINUTE;

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function longDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * "Active now" / "12 min ago" / "Yesterday" / "3 Aug" — the right-hand column
 * of a session row. Note the deliberate coarseness: lastSeenAt is only written
 * once a minute per session (the backend throttles it), so second-level
 * precision here would be a lie dressed up as detail.
 */
export function formatLastSeen(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();

  if (!Number.isFinite(then)) return "Unknown";

  const elapsed = now - then;

  if (elapsed < ACTIVE_WINDOW_MS) return "Active now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  }
  if (elapsed < 2 * DAY) return "Yesterday";
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} days ago`;

  return shortDate(new Date(then));
}

/** "Signed in 3 Aug 2026" — the second line of a session row. */
export function formatSignedIn(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "Signed in at an unknown time";

  return `Signed in ${longDate(date)}`;
}

/**
 * "Expires in 5 days" — worth showing because it is the answer to "why did that
 * device disappear from the list without me revoking it?".
 */
export function formatExpiry(iso: string, now: number = Date.now()): string {
  const remaining = new Date(iso).getTime() - now;

  if (!Number.isFinite(remaining)) return "";
  if (remaining <= 0) return "Expired";
  if (remaining < HOUR) return "Expires within the hour";
  if (remaining < DAY) {
    const hours = Math.floor(remaining / HOUR);
    return `Expires in ${hours} hr${hours === 1 ? "" : "s"}`;
  }

  const days = Math.floor(remaining / DAY);
  return `Expires in ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * How the password's age is described. A null passwordChangedAt is not an
 * error — it means the password has never been replaced since the account was
 * made, which is itself the useful thing to say.
 */
export function formatPasswordAge(
  passwordChangedAt: string | null,
  memberSince: string,
  now: number = Date.now()
): string {
  if (passwordChangedAt === null) {
    const joined = new Date(memberSince);
    return Number.isNaN(joined.getTime())
      ? "Never changed"
      : `Unchanged since you joined on ${longDate(joined)}`;
  }

  const changed = new Date(passwordChangedAt);

  if (Number.isNaN(changed.getTime())) return "Changed at an unknown time";

  const elapsed = now - changed.getTime();

  if (elapsed < DAY) return "Changed today";
  if (elapsed < 2 * DAY) return "Changed yesterday";
  if (elapsed < 30 * DAY) return `Changed ${Math.floor(elapsed / DAY)} days ago`;

  return `Changed ${longDate(changed)}`;
}

/**
 * Sessions come back newest-used first, but the caller's own device belongs at
 * the top whatever it was doing — it is the row people look for to orient
 * themselves in the list.
 */
export function sortSessions<T extends { current: boolean }>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
}
