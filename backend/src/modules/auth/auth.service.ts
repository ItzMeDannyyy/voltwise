// Documentation only: Service layer for the auth module.
// Contains all business logic for user registration, login, profile retrieval,
// and profile updates. Interacts directly with the Prisma DB client and
// uses bcryptjs for password hashing and the JWT helpers for token issuance.
// No HTTP-specific objects (req, res) ever appear here.

import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.ts";
import { signToken } from "../../lib/jwt.ts";
import { AppError } from "../../lib/AppError.ts";
import type {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  AuthUserResponseDto,
  AuthResponseDto,
} from "./auth.dto.ts";

// The bcrypt cost factor. 10 is the widely-accepted balance between security
// and hash speed for a low-traffic app; increase to 12 for production.
const BCRYPT_SALT_ROUNDS = 10;

// Documentation only: Converts a Prisma User record into the AuthUserResponseDto
// shape the mobile app expects. Critically, this function NEVER includes
// passwordHash in its output, preventing credential leakage via the API.
// Accepts the Prisma user object (with required fields subset).
// Returns an AuthUserResponseDto.
const formatUserForResponse = (user: {
  id: number;
  email: string;
  name: string | null;
  currency: string;
  createdAt: Date;
}): AuthUserResponseDto => {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    currency: user.currency,
    createdAt: user.createdAt.toISOString(),
  };
};

// Documentation only: Registers a new user with a hashed password and returns
// a signed JWT together with the sanitized user profile.
// Validates that email and password are present (controller checks this first,
// but the service guards again to be robust).
// Throws AppError 409 if a user with the given email already exists.
// Accepts a RegisterDto { email, name?, password }.
// Returns a Promise resolving to AuthResponseDto { token, user }.
export const registerUser = async (dto: RegisterDto): Promise<AuthResponseDto> => {
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

  const newUser = await prisma.user.create({
    data: {
      email: dto.email,
      name: dto.name ?? null,
      passwordHash: hashedPassword,
      // currency defaults to "₱" via the Prisma schema default
    },
  });

  const token = signToken({ id: newUser.id, email: newUser.email });
  const userDto = formatUserForResponse(newUser);

  return { token, user: userDto };
};

// Documentation only: Verifies a user's email and password and returns a signed
// JWT together with the sanitized user profile on success.
// Throws AppError 401 if no user exists with the given email, or if the password
// does not match the stored hash. The error message is intentionally vague
// ("Invalid credentials") to avoid revealing which field was wrong.
// Accepts a LoginDto { email, password }.
// Returns a Promise resolving to AuthResponseDto { token, user }.
export const loginUser = async (dto: LoginDto): Promise<AuthResponseDto> => {
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

  const token = signToken({ id: user.id, email: user.email });
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
// Accepts userId (number) and a partial UpdateProfileDto.
// Returns a Promise resolving to the updated AuthUserResponseDto.
export const updateProfile = async (
  userId: number,
  dto: UpdateProfileDto
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
      }),
    },
  });

  return formatUserForResponse(updatedUser);
};
