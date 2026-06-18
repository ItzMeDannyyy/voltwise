// Documentation only: Controller layer for the auth module (MVP minimal implementation).
// Handles HTTP request/response for the register and login endpoints.
// Delegates all logic to auth.service.ts. No business logic lives here.

import type { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service.ts";
import type { RegisterDto, LoginDto } from "./auth.dto.ts";

// Documentation only: Handles POST /api/auth/register.
// Reads email and optional name/password from the request body.
// For the MVP, returns the demo user regardless of the body content.
// Returns 201 with { success: true, data: AuthUserResponseDto } on success.
// Passes any errors to the Express error handler via next().
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const registerDto = req.body as RegisterDto;

    if (!registerDto.email) {
      res
        .status(400)
        .json({ success: false, message: "Email is required to register." });
      return;
    }

    const user = await authService.registerUser(registerDto);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles POST /api/auth/login.
// Reads email from the request body.
// For the MVP, returns the demo user regardless of provided credentials.
// Returns 200 with { success: true, data: AuthUserResponseDto } on success.
// Passes any errors to the Express error handler via next().
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const loginDto = req.body as LoginDto;

    if (!loginDto.email) {
      res
        .status(400)
        .json({ success: false, message: "Email is required to log in." });
      return;
    }

    const user = await authService.loginUser(loginDto);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};
