// Documentation only: The lifecycle of a Session row — the thing that makes a
// JWT revocable.
//
// A VoltWise token is stateless apart from one claim: `sid`, the id of the
// Session created when the holder signed in. requireAuth loads that row on
// every protected request, so deleting or revoking it takes effect immediately
// rather than whenever the seven-day token happens to expire. That is the whole
// reason the table exists; without it "sign out everywhere" could only clear
// storage on the device the user is already holding.
//
// Three layers use this module and none of them should touch prisma.session
// directly for these operations:
//   - auth.service   creates a session on register/login
//   - requireAuth    validates and touches it on each request
//   - security       lists and revokes them
//
// Nothing here throws for a missing or revoked session; callers decide what an
// absent session means (a 401 in the middleware, an empty list in the module).

import { prisma } from "./prisma.ts";
import { TOKEN_EXPIRY_MS } from "./jwt.ts";

// What a client can tell us about itself at sign-in. Everything is optional and
// untrusted — it is a display label, never an authorisation input.
export interface ClientHints {
  // Human-readable device name from the app ("Pixel 7", "Danny's iPhone").
  label?: unknown;
  // "android" | "ios" | "web"; anything else is normalised to "unknown".
  platform?: unknown;
  // Request headers / connection details, filled in by the controller.
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

// A session label is shown verbatim in a list of "your devices", so it is
// capped and stripped of control characters before being stored.
const MAX_LABEL_LENGTH = 60;

const PLATFORMS = ["android", "ios", "web"] as const;

// How stale lastSeenAt is allowed to get before a request writes it again.
// Every authenticated request would otherwise issue an UPDATE, and the
// dashboard polls; a minute of drift is invisible in a "last active" line and
// turns that write into a rarity.
export const LAST_SEEN_THROTTLE_MS = 60_000;

// Documentation only: Trims, strips control characters from and truncates a
// caller-supplied label. Returns null when nothing usable is left, so the
// caller can fall back to the User-Agent.
const sanitiseLabel = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  // Newlines and other control characters would wreck the device list layout.
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

  if (cleaned === "") return null;

  return cleaned.slice(0, MAX_LABEL_LENGTH);
};

// Documentation only: Produces a rough "Browser on OS" label from a User-Agent
// string, used when the client did not name itself (a browser hitting the API
// directly, or an older build of the app).
// Accepts the raw User-Agent header, possibly undefined.
// Returns a label such as "Chrome on Windows", or "Unknown device".
const labelFromUserAgent = (userAgent: string | undefined): string => {
  if (!userAgent) return "Unknown device";

  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : null;

  const os =
    /Windows/.test(userAgent) ? "Windows"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad|iOS/.test(userAgent) ? "iOS"
    : /Mac OS X|Macintosh/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : null;

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;

  return "Unknown device";
};

// Documentation only: Infers the platform when the client did not state one,
// so a browser session is still labelled "web" rather than "unknown".
const platformFromUserAgent = (userAgent: string | undefined): string => {
  if (!userAgent) return "unknown";
  if (/Android/.test(userAgent)) return "android";
  if (/iPhone|iPad|iOS/.test(userAgent)) return "ios";
  if (/Mozilla/.test(userAgent)) return "web";
  return "unknown";
};

// Documentation only: Resolves the hints a client sent (plus its User-Agent and
// IP) into the three columns a Session row stores. Client-supplied values win
// when they are usable because the app knows its own device name; the
// User-Agent is the fallback, not the default.
// Accepts a ClientHints object.
// Returns { label, platform, ipAddress } ready to persist.
export const describeClient = (
  hints: ClientHints
): { label: string; platform: string; ipAddress: string | null } => {
  const platform = PLATFORMS.find((candidate) => candidate === hints.platform);

  return {
    label: sanitiseLabel(hints.label) ?? labelFromUserAgent(hints.userAgent),
    platform: platform ?? platformFromUserAgent(hints.userAgent),
    ipAddress: hints.ipAddress ?? null,
  };
};

// Documentation only: Opens a session for a user who has just proved who they
// are. The expiry mirrors the token's own seven-day window so an abandoned
// session drops out of the list on its own.
// Accepts userId (number) and the ClientHints from the request.
// Returns a Promise resolving to the created Session's id, which the caller
// embeds in the JWT as `sid`.
export const createSession = async (
  userId: number,
  hints: ClientHints
): Promise<string> => {
  const { label, platform, ipAddress } = describeClient(hints);

  const session = await prisma.session.create({
    data: {
      userId,
      label,
      platform,
      ipAddress,
      expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
    },
  });

  return session.id;
};

// Documentation only: Loads a session only if it is still usable — present, not
// revoked, not past its expiry, and belonging to the user the token claims.
// The ownership check matters: without it a valid token for user A paired with
// user B's session id would authenticate, and session ids appear in the API
// response that lists devices.
// Accepts sessionId (string) and userId (number) from the verified token.
// Returns the Session row, or null when the token should be rejected.
export const loadActiveSession = async (sessionId: string, userId: number) => {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });

  if (!session) return null;
  if (session.userId !== userId) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  return session;
};

// Documentation only: Records that a session was used, at most once per
// LAST_SEEN_THROTTLE_MS. Deliberately swallows its own errors: "last active"
// is a display detail, and a failed UPDATE must never turn a successful
// authenticated request into a 500.
// Accepts the session row already loaded by loadActiveSession.
// Returns a Promise that always resolves.
export const touchSession = async (session: {
  id: string;
  lastSeenAt: Date;
}): Promise<void> => {
  if (Date.now() - session.lastSeenAt.getTime() < LAST_SEEN_THROTTLE_MS) return;

  try {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    // Ignored on purpose — see the note above.
  }
};

// Documentation only: Revokes every session belonging to a user except,
// optionally, one to keep alive. Used by "sign out everywhere else" and by a
// password change, which should not leave an attacker signed in on another
// device just because the owner picked a new password.
// Already-revoked rows are skipped so revokedAt keeps recording when a session
// actually ended rather than when the most recent sweep ran.
// Accepts userId (number) and keepSessionId (string | null).
// Returns a Promise resolving to the number of sessions revoked.
export const revokeOtherSessions = async (
  userId: number,
  keepSessionId: string | null
): Promise<number> => {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(keepSessionId !== null && { id: { not: keepSessionId } }),
    },
    data: { revokedAt: new Date() },
  });

  return result.count;
};
