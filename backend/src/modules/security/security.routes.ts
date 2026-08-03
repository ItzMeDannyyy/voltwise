// Documentation only: Registers the HTTP routes for the security module.
// Every route here is protected: requireAuth is applied once at the mount point
// in src/routes/index.ts, so each handler can rely on req.user and req.sessionId
// being populated.

import { Router } from "express";
import * as securityController from "./security.controller.ts";

const securityRouter = Router();

// GET /api/security/overview — account-safety summary + live sessions.
securityRouter.get("/overview", securityController.overview);

// POST /api/security/sessions/revoke-others — end every session but this one.
// Declared before the parameterised route below so "revoke-others" is never
// read as a session id.
securityRouter.post(
  "/sessions/revoke-others",
  securityController.revokeOtherSessions
);

// DELETE /api/security/sessions/:id — end one other signed-in device.
securityRouter.delete("/sessions/:id", securityController.revokeSession);

// DELETE /api/security/account — permanently delete the account, password required.
securityRouter.delete("/account", securityController.deleteAccount);

export default securityRouter;
