// Documentation only: Defines TypeScript types for the auth module request/response shapes.
// For the MVP, auth is minimal — no real password verification is performed.

// Request body for the register endpoint.
export interface RegisterDto {
  email: string;
  name?: string;
  password?: string;
}

// Request body for the login endpoint.
export interface LoginDto {
  email: string;
  password?: string;
}

// The user object returned by both register and login.
export interface AuthUserResponseDto {
  id: string;
  email: string;
  name: string | null;
  currency: string;
}
