// Documentation only: Application entry point for the VoltWise backend.
// Loads environment variables, creates the Express app, mounts all API routes
// under /api, adds a health check endpoint, and starts the HTTP server.

import "dotenv/config";
import express from "express";
import cors from "cors";
import appRouter from "./routes/index.ts";
import { AppError } from "./lib/AppError.ts";

const app = express();

// Allow all origins so the Expo mobile app can reach the API during development.
app.use(cors());

// Parse incoming JSON request bodies automatically.
app.use(express.json());

// Mount all feature module routes under the /api prefix.
app.use("/api", appRouter);

// Health check endpoint — used to verify the server is reachable.
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Global error handler — converts thrown errors into standardized JSON error responses.
// Express 5 passes async errors here automatically without explicit try/catch.
// AppError instances carry a statusCode so they map to the correct HTTP status
// (e.g. 400 Bad Request, 401 Unauthorized, 409 Conflict).
// Plain Error instances default to 500 Internal Server Error.
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof AppError) {
      // AppError signals a known, intentional failure with a specific HTTP status.
      // Log at a lower severity since these are client errors, not server bugs.
      console.warn(`AppError [${error.statusCode}]: ${error.message}`);
      res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
      return;
    }

    // Everything else is an unexpected server error — log the full stack.
    console.error("Unhandled server error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    res.status(500).json({ success: false, message });
  },
);

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`VoltWise backend running on http://localhost:${PORT}`);
});

export default app;
