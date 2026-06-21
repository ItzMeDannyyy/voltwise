// Documentation only: Controller layer for the auth module.
// Handles the HTTP request/response cycle for register, login, profile retrieval,
// and profile update endpoints. Validates incoming request shapes, delegates all
// business logic to auth.service.ts, and returns standardized JSON responses.
// No business logic lives here — controllers are thin HTTP adapters only.

import type { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service.ts";
import type { RegisterDto, LoginDto, UpdateProfileDto } from "./auth.dto.ts";

// Documentation only: Handles POST /api/auth/register.
// Validates that email and password are present in the request body.
// On success: creates the user, issues a JWT, and returns 201 with { token, user }.
// On duplicate email: the service throws AppError 409 which the global handler converts.
// On missing fields: returns 400 immediately without calling the service.
// Passes unexpected errors to the Express error handler via next().
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, name, password } = req.body as Partial<RegisterDto>;

    if (!email || typeof email !== "string" || email.trim() === "") {
      res.status(400).json({
        success: false,
        message: "email is required to register.",
      });
      return;
    }

    if (!password || typeof password !== "string" || password.trim() === "") {
      res.status(400).json({
        success: false,
        message: "password is required to register.",
      });
      return;
    }

    const registerDto: RegisterDto = {
      email: email.trim().toLowerCase(),
      name: name ? name.trim() : undefined,
      password,
    };

    const authResult = await authService.registerUser(registerDto);
    res.status(201).json({ success: true, data: authResult });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles POST /api/auth/login.
// Validates that email and password are present in the request body.
// On success: verifies credentials and returns 200 with { token, user }.
// On bad credentials: the service throws AppError 401 which the global handler converts.
// On missing fields: returns 400 immediately without calling the service.
// Passes unexpected errors to the Express error handler via next().
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body as Partial<LoginDto>;

    if (!email || typeof email !== "string" || email.trim() === "") {
      res.status(400).json({
        success: false,
        message: "email is required to log in.",
      });
      return;
    }

    if (!password || typeof password !== "string") {
      res.status(400).json({
        success: false,
        message: "password is required to log in.",
      });
      return;
    }

    const loginDto: LoginDto = {
      email: email.trim().toLowerCase(),
      password,
    };

    const authResult = await authService.loginUser(loginDto);
    res.status(200).json({ success: true, data: authResult });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles GET /api/auth/me.
// Protected by requireAuth middleware — req.user is guaranteed to be populated here.
// Fetches the full user profile from the DB (in case it was updated since token issuance).
// Returns 200 with { success: true, data: AuthUserResponseDto }.
// Passes errors to the Express error handler via next().
export const me = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // req.user is set by requireAuth — TypeScript knows it exists on protected routes.
    const userId = req.user!.id;

    const userProfile = await authService.getProfile(userId);
    res.status(200).json({ success: true, data: userProfile });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles PATCH /api/auth/me.
// Protected by requireAuth middleware — req.user is guaranteed to be populated here.
// All body fields are optional; only provided fields are changed.
// On email collision: the service throws AppError 409 which the global handler converts.
// On password mismatch: the service throws AppError 401 or AppError 400.
// Returns 200 with { success: true, data: AuthUserResponseDto } on success.
// Passes errors to the Express error handler via next().
export const updateMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;

    const updateDto: UpdateProfileDto = {};

    const { name, email, currency, currentPassword, newPassword } =
      req.body as Partial<UpdateProfileDto>;

    if (name !== undefined) updateDto.name = name;
    if (email !== undefined) updateDto.email = email.trim().toLowerCase();
    if (currency !== undefined) updateDto.currency = currency;
    if (currentPassword !== undefined) updateDto.currentPassword = currentPassword;
    if (newPassword !== undefined) updateDto.newPassword = newPassword;

    const updatedProfile = await authService.updateProfile(userId, updateDto);
    res.status(200).json({ success: true, data: updatedProfile });
  } catch (error) {
    next(error);
  }
};
