// Documentation only: Augments the Express Request interface to include the
// authenticated user's id and email, set by requireAuth middleware after a
// valid JWT is verified. Any route handler running behind requireAuth can safely
// read req.user without casting, because TypeScript knows the property exists.

declare global {
  namespace Express {
    interface Request {
      // Populated by requireAuth middleware. Present on every protected route;
      // undefined on public routes where the middleware has not run.
      user?: {
        // The numeric primary key of the authenticated user in the database.
        id: number;
        // The email address extracted from the verified JWT payload.
        email: string;
      };
      // The Session row this request authenticated against, also set by
      // requireAuth. The security module uses it to mark the caller's own
      // session as "this device" and to keep it alive when revoking the others.
      sessionId?: string;
    }
  }
}

// This empty export makes the file a module so the global declaration merging
// is correctly applied by TypeScript's type checker.
export {};
