// Documentation only: Registers all HTTP routes for the auth module.
// Maps register and login endpoints to their controller functions.

import { Router } from "express";
import * as authController from "./auth.controller.ts";

const authRouter = Router();

// POST /api/auth/register — registers a new user (MVP returns the demo user).
authRouter.post("/register", authController.register);

// POST /api/auth/login — logs in a user (MVP returns the demo user).
authRouter.post("/login", authController.login);

export default authRouter;
