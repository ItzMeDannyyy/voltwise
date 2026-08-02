import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { MIME_TYPES, formatBytes, type ExportFormat } from "./export-format";

/**
 * Getting an export off the device — the half of the feature that has nothing
 * to do with the API.
 *
 * The two platforms genuinely differ in kind, not just in API, and pretending
 * otherwise would produce a screen that lies on one of them:
 *
 *  - Native writes the file into the app's own cache directory and hands its URI
 *    to the system share sheet. The app keeps the file afterwards, which is why
 *    there is something to clear later.
 *  - Web hands a Blob to the browser, which puts it wherever the user's download
 *    settings say. Nothing is left behind that we can see, count, or delete.
 *
 * Everything is written into one subdirectory rather than straight into the
 * cache root so that clearing exports can never touch a cached image or a font
 * that some other part of Expo put there.
 */

const EXPORT_DIR_NAME = "exports";

/** Uniform Type Identifiers — iOS picks the share targets from these. */
const UTIS: Record<ExportFormat, string> = {
  csv: "public.comma-separated-values-text",
  json: "public.json",
};

export type SaveOutcome =
  /** Native: written to the cache directory and offered to the share sheet. */
  | "shared"
  /** Native: written, but no share target exists (a bare simulator). */
  | "saved"
  /** Web: handed to the browser's downloads. */
  | "downloaded";

export interface SaveResult {
  outcome: SaveOutcome;
  filename: string;
  /** Where the file lives on native; null on web, where we never learn. */
  uri: string | null;
  bytes: number;
}

/** What the cached-exports card shows. Always zeroes on web. */
export interface CachedExports {
  count: number;
  bytes: number;
  /** Pre-formatted, since every caller wants the same "3 files · 1.2 MB". */
  label: string;
}

export const supportsFileCache = Platform.OS !== "web";

/**
 * The export directory, created on first use. Not memoised: a Directory is a
 * path wrapper, and the underlying directory can be deleted out from under us
 * by clearExports or by the OS reclaiming cache space.
 */
function exportDirectory(): Directory {
  const dir = new Directory(Paths.cache, EXPORT_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Writes `content` and offers it to the user.
 *
 * Throws on a write failure — a full disk is worth reporting rather than
 * swallowing into a success message. A share sheet the user dismisses is not a
 * failure: the file is on disk either way, so the result still says so.
 */
export async function saveExport(
  filename: string,
  content: string,
  format: ExportFormat
): Promise<SaveResult> {
  const mimeType = MIME_TYPES[format];
  // The string is UTF-8 on the wire and UTF-8 on disk; measuring it in JS
  // characters would under-report every non-ASCII byte the backend sent.
  const bytes = byteLength(content);

  if (Platform.OS === "web") {
    downloadInBrowser(filename, content, mimeType);
    return { outcome: "downloaded", filename, uri: null, bytes };
  }

  const file = new File(exportDirectory(), filename);
  // overwrite so a same-minute re-export replaces its predecessor instead of
  // throwing; the filename already carries the timestamp that keeps them apart.
  file.create({ overwrite: true, intermediates: true });
  file.write(content);

  if (!(await Sharing.isAvailableAsync())) {
    return { outcome: "saved", filename, uri: file.uri, bytes };
  }

  await Sharing.shareAsync(file.uri, {
    mimeType,
    UTI: UTIS[format],
    dialogTitle: filename,
  });

  return { outcome: "shared", filename, uri: file.uri, bytes };
}

/**
 * Re-opens the share sheet for a file already on disk, so a dismissed share
 * does not mean re-running the whole export against the server.
 * Returns false when the file is gone or sharing is unavailable.
 */
export async function reshareExport(
  uri: string,
  format: ExportFormat
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!new File(uri).exists) return false;
  if (!(await Sharing.isAvailableAsync())) return false;

  await Sharing.shareAsync(uri, { mimeType: MIME_TYPES[format], UTI: UTIS[format] });
  return true;
}

/** Counts and measures what previous exports have left in the cache. */
export function listCachedExports(): CachedExports {
  if (!supportsFileCache) return { count: 0, bytes: 0, label: "Not applicable" };

  try {
    const dir = new Directory(Paths.cache, EXPORT_DIR_NAME);
    if (!dir.exists) return { count: 0, bytes: 0, label: "Nothing stored" };

    const files = dir.list().filter((entry): entry is File => entry instanceof File);
    const bytes = files.reduce((total, file) => total + (file.size || 0), 0);

    if (files.length === 0) return { count: 0, bytes: 0, label: "Nothing stored" };

    return {
      count: files.length,
      bytes,
      label: `${files.length} file${files.length === 1 ? "" : "s"} · ${formatBytes(bytes)}`,
    };
  } catch {
    // A cache directory the OS reclaimed mid-read is an empty one, not an error
    // worth showing on a settings screen.
    return { count: 0, bytes: 0, label: "Nothing stored" };
  }
}

/**
 * Deletes every export written by this app. Returns how many files went.
 * Only ever touches the exports subdirectory.
 */
export function clearCachedExports(): number {
  if (!supportsFileCache) return 0;

  const dir = new Directory(Paths.cache, EXPORT_DIR_NAME);
  if (!dir.exists) return 0;

  const { count } = listCachedExports();
  dir.delete();
  return count;
}

// ---- Platform details ----

/** UTF-8 byte count, falling back to the character count where TextEncoder isn't. */
function byteLength(text: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return text.length;
}

/**
 * The browser equivalent of a share sheet: an object URL behind a synthetic
 * click. Revoked on the next tick — revoking immediately races the download in
 * Firefox and Safari.
 */
function downloadInBrowser(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 0);
}
