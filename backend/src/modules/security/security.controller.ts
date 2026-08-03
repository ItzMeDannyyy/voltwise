// Documentation only: Controller layer for the security module.
// Thin HTTP adapters over security.service.ts: they read the caller's identity
// from req.user / req.sessionId (both set by requireAuth), validate the request
// shape, and wrap the result in the standard { success, data } envelope.
// No business logic lives here.

import type { Request, Response, NextFunction } from "express";
import * as securityService from "./security.service.ts";
import type { DeleteAccountDto } from "./security";

// Documentation only: Handles GET /api/security/overview.
// Returns the account-safety summary plus every live session on the account.
// Protected by requireAuth, so req.user and req.sessionId are both populated.
// Returns 200 with { success: true, data: SecurityOverviewDto }.
export const overview = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await securityService.getOverview(req.user!.id, req.sessionId!);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles DELETE /api/security/sessions/:id.
// Ends one other signed-in device. The service rejects an attempt to revoke the
// caller's own session (400) and an id that is not this user's (404).
// Returns 200 with { success: true, data: RevokeResultDto }.
export const revokeSession = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Express 5 types a route param as string | string[]; only the single
    // value form is meaningful for a session id.
    const rawId = req.params.id;
    const sessionId = typeof rawId === "string" ? rawId.trim() : "";

    if (sessionId === "") {
      res.status(400).json({ success: false, message: "A session id is required." });
      return;
    }

    const data = await securityService.revokeSession(
      req.user!.id,
      req.sessionId!,
      sessionId
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles POST /api/security/sessions/revoke-others.
// Ends every session on the account except the one making the request.
// Returns 200 with { success: true, data: RevokeResultDto }.
export const revokeOtherSessions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await securityService.revokeOthers(req.user!.id, req.sessionId!);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles DELETE /api/security/account.
// Requires the account password in the body even though the caller is already
// authenticated — see the note on DeleteAccountDto.
// On success the caller's token is dead, because the session rows cascade away
// with the user; the app signs out locally as soon as this resolves.
// Returns 200 with { success: true, data: DeleteAccountResultDto }.
export const deleteAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { password } = req.body as Partial<DeleteAccountDto>;

    if (!password || typeof password !== "string") {
      res.status(400).json({
        success: false,
        message: "Your password is required to delete your account.",
      });
      return;
    }

    const data = await securityService.deleteAccount(req.user!.id, password);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
