// Documentation only: Authentication middleware for the VoltWise API.
// Reads the Authorization header, extracts the Bearer token, verifies it,
// confirms the session it names is still live, and attaches the decoded user
// identity to req.user so downstream controllers can read the authenticated
// user's id without parsing the token again.
// Any route that requires authentication should be guarded with requireAuth.

import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt.ts";
import { loadActiveSession, touchSession } from "../lib/sessions.ts";

// The header scheme prefix that all VoltWise clients must use.
const BEARER_SCHEME = "Bearer ";

// Documentation only: Express middleware that enforces authentication on any
// route it is applied to. Reads the Authorization header, strips the "Bearer "
// prefix, calls verifyToken, looks up the Session named by the token's `sid`
// claim, and writes the decoded { id, email } payload onto req.user (plus the
// session id onto req.sessionId) so controller functions can use them without
// re-verifying.
//
// The session lookup is what makes a token revocable: a signature can still be
// valid while the session behind it has been signed out from another device, and
// only the database knows that. It costs one indexed primary-key read per
// request, and the row's lastSeenAt is refreshed at most once a minute
// (see lib/sessions.ts) so polling clients do not turn every GET into a write.
//
// If the header is missing or malformed, the token is invalid/expired, or the
// session is missing, revoked or expired, responds immediately with
// 401 { success: false, message: "Unauthorized" } and does NOT call next(),
// preventing the route handler from executing.
// Accepts the standard Express (req, res, next) triple.
// Returns a Promise<void> — either calls next() or sends a 401 response.
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authorizationHeader = req.headers.authorization;

  // Reject requests that are missing the Authorization header entirely.
  if (!authorizationHeader) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  // Reject requests whose Authorization header does not follow the Bearer scheme.
  if (!authorizationHeader.startsWith(BEARER_SCHEME)) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  // Strip "Bearer " from the front to isolate the raw token string.
  const rawToken = authorizationHeader.slice(BEARER_SCHEME.length);

  if (!rawToken) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  try {
    // verifyToken throws for expired, tampered and malformed tokens, and also
    // for pre-session tokens that carry no `sid` — those cannot be revoked, so
    // they are refused and their holder signs in again.
    const decodedPayload = verifyToken(rawToken);

    const session = await loadActiveSession(decodedPayload.sid, decodedPayload.id);

    if (session === null) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    // Attach the verified identity to the request so controllers can read it
    // without touching the token again.
    req.user = { id: decodedPayload.id, email: decodedPayload.email };
    req.sessionId = session.id;

    // Fire-and-forget: touchSession never rejects, and the request should not
    // wait on a bookkeeping write.
    void touchSession(session);

    next();
  } catch {
    // Any authentication failure — bad signature, expired token, no session
    // claim, or a database error while checking the session — is a 401.
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
};
