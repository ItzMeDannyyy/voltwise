// Documentation only: Service layer for the auth module.
// Contains all business logic for user registration, login, profile retrieval,
// and profile updates. Interacts directly with the Prisma DB client and
// uses bcryptjs for password hashing and the JWT helpers for token issuance.
// No HTTP-specific objects (req, res) ever appear here.

import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.ts";
import { signToken, signResetToken, verifyResetToken } from "../../lib/jwt.ts";
import {
  createSession,
  revokeOtherSessions,
  type ClientHints,
} from "../../lib/sessions.ts";
import { AppError } from "../../lib/AppError.ts";
import type {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  AuthUserResponseDto,
  AuthResponseDto,
  ForgotPasswordResponseDto,
  ResetPasswordResponseDto,
} from "./auth";

// The bcrypt cost factor. 10 is the widely-accepted balance between security
// and hash speed for a low-traffic app; increase to 12 for production.
const BCRYPT_SALT_ROUNDS = 10;

// Documentation only: Validates that a password satisfies the strong-password policy.
// Policy requires: length >= 12, at least one letter, one digit, and one special character.
// Accepts the raw plaintext password string.
// Returns null when the password is valid, or a human-readable error message string when it fails.
// Exported so that other modules (e.g. reset-password flows) can reuse the same rule without
// duplicating the regex definitions.
export const validatePasswordStrength = (password: string): string | null => {
  const meetsMinimumLength = password.length >= 12;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialCharacter = /[^A-Za-z0-9]/.test(password);

  if (!meetsMinimumLength || !hasLetter || !hasNumber || !hasSpecialCharacter) {
    return "Password must be at least 12 characters and include a letter, a number, and a special character.";
  }

  return null;
};

// Documentation only: Converts a Prisma User record into the AuthUserResponseDto
// shape the mobile app expects. Critically, this function NEVER includes
// passwordHash in its output, preventing credential leakage via the API.
// Accepts the Prisma user object (with required fields subset, now including firstName and lastName).
// Returns an AuthUserResponseDto.
const formatUserForResponse = (user: {
  id: number;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  currency: string;
  createdAt: Date;
}): AuthUserResponseDto => {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    currency: user.currency,
    createdAt: user.createdAt.toISOString(),
  };
};

// Documentation only: Registers a new user with a hashed password and returns
// a signed JWT together with the sanitized user profile.
// Runs the password strength policy first (throws AppError 400 if it fails).
// Throws AppError 409 if a user with the given email already exists.
// Accepts a RegisterDto { firstName, lastName, email, password } and the
// ClientHints describing the device signing up, which become the first row in
// that account's session list.
// Sets `name` to "<firstName> <lastName>" so that existing name-based display
// in the app keeps working without changes on the frontend.
// Returns a Promise resolving to AuthResponseDto { token, user }.
export const registerUser = async (
  dto: RegisterDto,
  client: ClientHints = {}
): Promise<AuthResponseDto> => {
  // Run the password strength check before touching the DB.
  // This ensures we never persist a user whose password would later be
  // rejected if we run the same check on another code path.
  const passwordPolicyViolation = validatePasswordStrength(dto.password);
  if (passwordPolicyViolation !== null) {
    throw new AppError(400, passwordPolicyViolation);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: dto.email },
  });

  if (existingUser) {
    throw new AppError(
      409,
      "An account with that email address already exists. Please log in instead."
    );
  }

  const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

  // Compose the backwards-compatible `name` field from the two discrete parts.
  // Trim each part before joining so leading/trailing whitespace from the caller
  // doesn't produce a name like " User" or "Demo ".
  const composedFullName = `${dto.firstName.trim()} ${dto.lastName.trim()}`;

  const newUser = await prisma.user.create({
    data: {
      email: dto.email,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      name: composedFullName,
      passwordHash: hashedPassword,
      // currency defaults to "₱" via the Prisma schema default
    },
  });

  const sessionId = await createSession(newUser.id, client);
  const token = signToken({ id: newUser.id, email: newUser.email, sid: sessionId });
  const userDto = formatUserForResponse(newUser);

  return { token, user: userDto };
};

// Documentation only: Verifies a user's email and password and returns a signed
// JWT together with the sanitized user profile on success.
// Throws AppError 401 if no user exists with the given email, or if the password
// does not match the stored hash. The error message is intentionally vague
// ("Invalid credentials") to avoid revealing which field was wrong.
// Accepts a LoginDto { email, password } and the ClientHints describing the
// device signing in, which open a new session listed under Privacy & Security.
// Returns a Promise resolving to AuthResponseDto { token, user }.
export const loginUser = async (
  dto: LoginDto,
  client: ClientHints = {}
): Promise<AuthResponseDto> => {
  const user = await prisma.user.findUnique({
    where: { email: dto.email },
  });

  // Respond with the same generic message for both "no such email" and "wrong
  // password" cases to prevent user enumeration attacks.
  if (!user) {
    throw new AppError(401, "Invalid credentials");
  }

  // Users created before the password migration (i.e. the original MVP demo user
  // without a passwordHash) should not be able to log in until the seed is re-run.
  if (!user.passwordHash) {
    throw new AppError(401, "Invalid credentials");
  }

  const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError(401, "Invalid credentials");
  }

  const sessionId = await createSession(user.id, client);
  const token = signToken({ id: user.id, email: user.email, sid: sessionId });
  const userDto = formatUserForResponse(user);

  return { token, user: userDto };
};

// Documentation only: Retrieves the authenticated user's profile by their numeric id.
// Throws AppError 404 if the user no longer exists (e.g. was deleted after token issuance).
// Accepts userId (number) — taken from the verified JWT payload via req.user.id.
// Returns a Promise resolving to AuthUserResponseDto.
export const getProfile = async (userId: number): Promise<AuthUserResponseDto> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError(404, "User account not found.");
  }

  return formatUserForResponse(user);
};

// Documentation only: Updates the authenticated user's profile fields.
// Each field in UpdateProfileDto is optional; only provided fields are changed.
// Email change: if the new email is already in use by another account, throws 409.
// Password change: requires currentPassword to be provided and to match the stored
// hash; throws AppError 400 if currentPassword is absent or 401 if it is wrong.
// A successful password change also revokes every other session on the account.
// Whoever knew the old password should not stay signed in on a device the owner
// cannot see, and that is precisely the situation a password change is usually
// reacting to. The caller's own session is kept so changing a password does not
// eject the person who just changed it — pass currentSessionId (req.sessionId)
// to identify it; omit it and every session including the caller's is revoked.
// Accepts userId (number), a partial UpdateProfileDto, and currentSessionId.
// Returns a Promise resolving to the updated AuthUserResponseDto.
export const updateProfile = async (
  userId: number,
  dto: UpdateProfileDto,
  currentSessionId: string | null = null
): Promise<AuthUserResponseDto> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError(404, "User account not found.");
  }

  // ── Email uniqueness check ────────────────────────────────────────────────────
  if (dto.email !== undefined && dto.email !== user.email) {
    const existingUserWithNewEmail = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUserWithNewEmail) {
      throw new AppError(
        409,
        "That email address is already in use by another account."
      );
    }
  }

  // ── Password change flow ──────────────────────────────────────────────────────
  let newHashedPassword: string | undefined = undefined;

  if (dto.newPassword !== undefined) {
    // Changing password requires the user to prove they know the current one.
    if (!dto.currentPassword) {
      throw new AppError(
        400,
        "currentPassword is required to set a new password."
      );
    }

    if (!user.passwordHash) {
      throw new AppError(
        400,
        "This account does not have a password set. Please contact support."
      );
    }

    const currentPasswordMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash
    );

    if (!currentPasswordMatches) {
      throw new AppError(401, "Current password is incorrect.");
    }

    newHashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
  }

  // ── Apply the update ──────────────────────────────────────────────────────────
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(newHashedPassword !== undefined && {
        passwordHash: newHashedPassword,
        passwordChangedAt: new Date(),
      }),
    },
  });

  // Only after the new hash is committed — revoking first would sign other
  // devices out on behalf of an update that then failed.
  if (newHashedPassword !== undefined) {
    await revokeOtherSessions(userId, currentSessionId);
  }

  return formatUserForResponse(updatedUser);
};

// Documentation only: Looks up the user by email and, if found, issues a short-lived
// password-reset token tied to that account.
// Throws AppError 404 if no account exists with the given email so the caller can
// give the user a helpful message rather than silently doing nothing.
// MVP NOTE: In production, this function would dispatch the reset token via email
// (e.g. SendGrid / Nodemailer) and return only a generic success message. For this
// MVP there is no email service in scope, so the reset token is returned directly
// in the response body for the mobile app to carry into the reset step.
// Accepts email (string) — already normalised (lowercased & trimmed) by the controller.
// Returns a Promise resolving to ForgotPasswordResponseDto { resetToken, email }.
export const forgotPassword = async (
  email: string
): Promise<ForgotPasswordResponseDto> => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError(404, "No account found with that email address.");
  }

  const resetToken = signResetToken({ id: user.id, email: user.email });

  return { resetToken, email: user.email };
};

// Documentation only: Verifies a password-reset token and replaces the user's
// password with a freshly hashed version of the supplied newPassword.
// Throws AppError 401 if the token is invalid, expired, or not a reset token.
// Throws AppError 400 if newPassword is fewer than 6 characters.
// On success: updates passwordHash in the DB and returns a confirmation message.
// Accepts token (string) — the raw reset JWT — and newPassword (string).
// Returns a Promise resolving to ResetPasswordResponseDto { message }.
export const resetPassword = async (
  token: string,
  newPassword: string
): Promise<ResetPasswordResponseDto> => {
  // Verify the token before touching the DB; any JWT error becomes a 401.
  let verifiedPayload: { id: number; email: string };

  try {
    verifiedPayload = verifyResetToken(token);
  } catch {
    throw new AppError(
      401,
      "This reset link is invalid or has expired. Please try again."
    );
  }

  // Enforce a minimum password length before doing any DB work.
  if (newPassword.length < 6) {
    throw new AppError(400, "New password must be at least 6 characters.");
  }

  const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  await prisma.user.update({
    where: { id: verifiedPayload.id },
    data: { passwordHash: newPasswordHash, passwordChangedAt: new Date() },
  });

  // A reset is the "I have lost control of this account" path, so every session
  // goes — there is no caller session to preserve here, since the person is not
  // signed in. The response already tells them to sign in again.
  await revokeOtherSessions(verifiedPayload.id, null);

  return { message: "Your password has been reset. Please sign in." };
};
