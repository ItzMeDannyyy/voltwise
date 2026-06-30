// Documentation only: Authentication middleware for the VoltWise API.
// Reads the Authorization header, extracts the Bearer token, verifies it,
// and attaches the decoded user identity to req.user so downstream controllers
// can read the authenticated user's id without parsing the token again.
// Any route that requires authentication should be guarded with requireAuth.

import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt.ts";

// The header scheme prefix that all VoltWise clients must use.
const BEARER_SCHEME = "Bearer ";

// Documentation only: Express middleware that enforces authentication on any
// route it is applied to. Reads the Authorization header, strips the "Bearer "
// prefix, calls verifyToken, and writes the decoded { id, email } payload onto
// req.user so controller functions can use it without re-verifying.
// If the header is missing, malformed, or the token is invalid/expired,
// responds immediately with 401 { success: false, message: "Unauthorized" }
// and does NOT call next(), preventing the route handler from executing.
// Accepts the standard Express (req, res, next) triple.
// Returns void — either calls next() or sends a 401 response.
export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
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
    const decodedPayload = verifyToken(rawToken);

    // Attach the verified identity to the request so controllers can read it
    // without touching the token again.
    req.user = { id: decodedPayload.id, email: decodedPayload.email };

    next();
  } catch {
    // verifyToken throws for expired, tampered, or malformed tokens.
    // All of these are authentication failures — return 401.
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
};
