// Documentation only: Multer configuration for device photo uploads.
// Stores images on local disk in backend/uploads/ (the "bucket"), which is
// served statically at /uploads by index.ts. Only common image formats are
// accepted and files are capped at 5 MB. Filenames embed the device id and a
// timestamp so they never collide and old files are easy to trace.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { AppError } from "./AppError.ts";

// Absolute path to backend/uploads/, independent of the process cwd.
export const UPLOADS_DIR = path.resolve(
  fileURLToPath(new URL("../../uploads", import.meta.url))
);

// Accepted image mimetypes mapped to the extension we store them with.
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // The folder is committed with a .gitkeep, but recreate it defensively so
    // a fresh clone or cleaned checkout never breaks uploads.
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const extension = IMAGE_EXTENSIONS[file.mimetype] ?? ".jpg";
    cb(null, `device-${req.params.id}-${Date.now()}${extension}`);
  },
});

// Documentation only: Multer middleware instance for device photos.
// Usage: deviceImageUpload.single("photo") on the route. Rejects non-image
// mimetypes with a 400 AppError (handled by the global error handler).
export const deviceImageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_EXTENSIONS[file.mimetype]) {
      cb(new AppError(400, "Only JPEG, PNG, or WebP images are allowed."));
      return;
    }
    cb(null, true);
  },
});
