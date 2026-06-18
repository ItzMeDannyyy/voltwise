// Documentation only: Service layer for the auth module (MVP minimal implementation).
// For the MVP, auth operations return the demo user directly without real password hashing.
// This module exists as a placeholder for future full authentication implementation.

import { prisma } from "../../lib/prisma.ts";
import type { AuthUserResponseDto, RegisterDto, LoginDto } from "./auth.dto.ts";

// The demo user ID that acts as the system's single authenticated user in the MVP.
const DEMO_USER_ID = 1;

// Documentation only: Formats a Prisma User record into the AuthUserResponseDto shape.
// Accepts a Prisma user object.
// Returns an AuthUserResponseDto.
const formatUserForResponse = (user: {
  id: number;
  email: string;
  name: string | null;
  currency: string;
}): AuthUserResponseDto => {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    currency: user.currency,
  };
};

// Documentation only: Returns the demo user for the MVP register endpoint.
// In production this would create a new user with a hashed password.
// Accepts a RegisterDto.
// Returns a Promise resolving to the demo AuthUserResponseDto.
export const registerUser = async (
  dto: RegisterDto
): Promise<AuthUserResponseDto> => {
  const demoUser = await prisma.user.findUnique({
    where: { id: DEMO_USER_ID },
  });

  if (!demoUser) {
    throw new Error("Demo user not found. Please run the seed script.");
  }

  return formatUserForResponse(demoUser);
};

// Documentation only: Returns the demo user for the MVP login endpoint.
// In production this would verify the password hash against the stored value.
// Accepts a LoginDto.
// Returns a Promise resolving to the demo AuthUserResponseDto.
export const loginUser = async (
  dto: LoginDto
): Promise<AuthUserResponseDto> => {
  const demoUser = await prisma.user.findUnique({
    where: { id: DEMO_USER_ID },
  });

  if (!demoUser) {
    throw new Error("Demo user not found. Please run the seed script.");
  }

  return formatUserForResponse(demoUser);
};
