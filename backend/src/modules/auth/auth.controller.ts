// Documentation only: Controller layer for the auth module.
// Handles the HTTP request/response cycle for register, login, profile retrieval,
// and profile update endpoints. Validates incoming request shapes, delegates all
// business logic to auth.service.ts, and returns standardized JSON responses.
// No business logic lives here — controllers are thin HTTP adapters only.

import type { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service.ts";
import type {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from "./auth";

// Documentation only: Handles POST /api/auth/register.
// Validates presence of firstName, lastName, email, and password from the request body.
// The password STRENGTH check (letter + number + special char, >= 12 chars) is delegated
// to the service layer (auth.service.ts::validatePasswordStrength) so the rule lives in
// one place and is reusable. This controller only checks that each field is a non-empty string.
// On success: creates the user, issues a JWT, and returns 201 with { token, user }.
// On duplicate email: the service throws AppError 409 which the global handler converts.
// On missing fields: returns 400 immediately without calling the service.
// On weak password: the service throws AppError 400 which the global handler converts.
// Passes unexpected errors to the Express error handler via next().
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { firstName, lastName, email, password } =
      req.body as Partial<RegisterDto>;

    if (!firstName || typeof firstName !== "string" || firstName.trim() === "") {
      res.status(400).json({
        success: false,
        message: "firstName is required to register.",
      });
      return;
    }

    if (!lastName || typeof lastName !== "string" || lastName.trim() === "") {
      res.status(400).json({
        success: false,
        message: "lastName is required to register.",
      });
      return;
    }

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
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
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

// Documentation only: Handles POST /api/auth/forgot-password.
// Validates that email is present and is a non-empty string, then normalises it
// (trim + lowercase) before delegating to the service.
// On missing/invalid email: returns 400 immediately without calling the service.
// On unknown email: the service throws AppError 404 which the global handler converts.
// On success: returns 200 with { success: true, data: { resetToken, email } }.
// MVP NOTE: the reset token is returned directly in the response because there is
// no email service in scope. In production the token would be emailed as a link
// and this endpoint would return only a generic "check your inbox" message.
// Passes unexpected errors to the Express error handler via next().
export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body as Partial<ForgotPasswordDto>;

    if (!email || typeof email !== "string" || email.trim() === "") {
      res.status(400).json({
        success: false,
        message: "email is required to reset your password.",
      });
      return;
    }

    const normalisedEmail = email.trim().toLowerCase();

    const resetPayload = await authService.forgotPassword(normalisedEmail);
    res.status(200).json({ success: true, data: resetPayload });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles POST /api/auth/reset-password.
// Validates that token and newPassword are both present and are non-empty strings.
// On missing fields: returns 400 immediately without calling the service.
// On invalid/expired token: the service throws AppError 401 which the global handler converts.
// On newPassword too short: the service throws AppError 400.
// On success: returns 200 with { success: true, data: { message } }.
// Passes unexpected errors to the Express error handler via next().
export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token, newPassword } = req.body as Partial<ResetPasswordDto>;

    if (!token || typeof token !== "string" || token.trim() === "") {
      res.status(400).json({
        success: false,
        message: "token is required to reset your password.",
      });
      return;
    }

    if (
      !newPassword ||
      typeof newPassword !== "string" ||
      newPassword.trim() === ""
    ) {
      res.status(400).json({
        success: false,
        message: "newPassword is required.",
      });
      return;
    }

    const result = await authService.resetPassword(token.trim(), newPassword);
    res.status(200).json({ success: true, data: result });
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
