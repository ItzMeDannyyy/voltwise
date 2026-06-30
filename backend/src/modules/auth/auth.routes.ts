// Documentation only: Registers all HTTP routes for the auth module.
// Public routes (register, login) are open to unauthenticated callers.
// Protected routes (GET /me, PATCH /me) require a valid Bearer token and
// are guarded by the requireAuth middleware.

import { Router } from "express";
import * as authController from "./auth.controller.ts";
import { requireAuth } from "../../middleware/auth.middleware.ts";

const authRouter = Router();

// POST /api/auth/register — creates a new user account and returns a JWT.
authRouter.post("/register", authController.register);

// POST /api/auth/login — verifies credentials and returns a JWT.
authRouter.post("/login", authController.login);

// POST /api/auth/forgot-password — issues a short-lived password-reset token for the given email.
// Public route — no auth token required.
// MVP: returns the reset token directly in the response (no email service in scope).
authRouter.post("/forgot-password", authController.forgotPassword);

// POST /api/auth/reset-password — verifies the reset token and replaces the user's password.
// Public route — no auth token required.
authRouter.post("/reset-password", authController.resetPassword);

// GET /api/auth/me — returns the authenticated user's profile.
// Requires Authorization: Bearer <token>.
authRouter.get("/me", requireAuth, authController.me);

// PATCH /api/auth/me — updates the authenticated user's profile fields.
// Requires Authorization: Bearer <token>.
authRouter.patch("/me", requireAuth, authController.updateMe);

export default authRouter;
