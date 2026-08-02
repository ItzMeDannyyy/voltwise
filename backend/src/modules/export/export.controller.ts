// Documentation only: Controller layer for the export module.
// Validates the dataset / range / format triple, delegates to the service, and
// renders the result as a downloadable file.
//
// The download endpoint is the one place in the API that does not wrap its body
// in the { success, data } envelope: the response IS the file. An envelope would
// mean the recipient has to unwrap a JSON object to reach a CSV string, and the
// JSON flavour would arrive double-nested. Errors still use the envelope, since
// an error is not a file.
// No business logic lives here.

import type { Request, Response, NextFunction } from "express";
import { UTF8_BOM, toCsv } from "../../lib/csv.ts";
import * as exportService from "./export.service.ts";
import type { ExportDataset, ExportFormat, ExportRange } from "./export";

const VALID_DATASETS: ExportDataset[] = ["readings", "devices", "alerts"];
const VALID_RANGES: ExportRange[] = ["today", "7d", "30d", "all"];
const VALID_FORMATS: ExportFormat[] = ["csv", "json"];

// A month is the useful default: it covers a billing cycle without pulling a
// board's entire publish history on the first tap.
const DEFAULT_RANGE: ExportRange = "30d";

// Documentation only: Reads and validates the range query parameter.
// Accepts the raw query value (unknown, since Express types query values loosely).
// Returns the ExportRange, or null when the caller sent something unrecognised.
const parseRange = (raw: unknown): ExportRange | null => {
  if (raw === undefined) return DEFAULT_RANGE;
  return VALID_RANGES.includes(raw as ExportRange) ? (raw as ExportRange) : null;
};

// Documentation only: Handles GET /api/export/summary?range=today|7d|30d|all.
// Returns row counts per dataset plus the reading window bounds, so the app can
// tell the user what a download would contain before starting it.
export const getSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const range = parseRange(req.query.range);

    if (range === null) {
      res.status(400).json({
        success: false,
        message: `Invalid range. Must be one of: ${VALID_RANGES.join(", ")}.`,
      });
      return;
    }

    const summary = await exportService.getExportSummary(req.user!.id, range);
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles GET /api/export/:dataset?range=…&format=csv|json.
// Streams the authenticated user's data back as a file body: UTF-8 CSV (with a
// BOM so Excel on Windows reads the currency symbols correctly) or a JSON
// document carrying the same rows plus the metadata a CSV has nowhere to put.
// Returns 400 for an unknown dataset, range, or format.
export const getExport = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const dataset = req.params.dataset as ExportDataset;

    if (!VALID_DATASETS.includes(dataset)) {
      res.status(400).json({
        success: false,
        message: `Invalid dataset "${req.params.dataset}". Must be one of: ${VALID_DATASETS.join(", ")}.`,
      });
      return;
    }

    const range = parseRange(req.query.range);

    if (range === null) {
      res.status(400).json({
        success: false,
        message: `Invalid range. Must be one of: ${VALID_RANGES.join(", ")}.`,
      });
      return;
    }

    const rawFormat = (req.query.format as string) ?? "csv";
    const format = rawFormat as ExportFormat;

    if (!VALID_FORMATS.includes(format)) {
      res.status(400).json({
        success: false,
        message: `Invalid format "${rawFormat}". Must be one of: ${VALID_FORMATS.join(", ")}.`,
      });
      return;
    }

    const table = await exportService.buildExportTable(req.user!.id, dataset, range);
    const filename = exportService.exportFilename(dataset, range, format);

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // These files are per-user and change with every new reading, so no shared
    // cache should ever hold one.
    res.setHeader("Cache-Control", "no-store");

    if (format === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(200).send(
        JSON.stringify(
          {
            dataset: table.dataset,
            range: table.range,
            generatedAt: table.generatedAt,
            rowCount: table.rows.length,
            truncated: table.truncated,
            columns: table.columns,
            rows: table.rows,
          },
          null,
          2
        )
      );
      return;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.status(200).send(UTF8_BOM + toCsv(table.rows, table.columns));
  } catch (error) {
    next(error);
  }
};
