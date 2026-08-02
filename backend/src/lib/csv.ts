// Documentation only: Shared CSV serializer used by the export module.
// Lives in lib/ rather than inside the module because CSV is a wire format, not
// a feature: any future module that needs to hand a spreadsheet to a user should
// produce byte-identical output rather than reinventing the quoting rules.
//
// Follows RFC 4180: fields containing a quote, comma, or line break are wrapped
// in double quotes and embedded quotes are doubled; records are CRLF-terminated.

// The value types a cell may hold. Timestamps are pre-formatted as ISO strings
// by the caller so that the CSV and JSON renderings of the same export agree
// exactly rather than depending on whichever Date serializer each format uses.
export type CsvValue = string | number | boolean | null | undefined;

// One record, keyed by column header. Using the header as the key means the same
// row objects can be emitted as JSON without a second mapping step.
export type CsvRow = Record<string, CsvValue>;

const NEEDS_QUOTING = /["\r\n,]/;

// Excel and Google Sheets evaluate a cell whose text begins with one of these as
// a formula. Device names and alert titles are user-authored and end up in cells,
// so a name like "=cmd|'/c calc'!A1" would execute on the machine of whoever
// opens the export. Prefixing a single quote renders the value as literal text.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

// Documentation only: Renders a single cell.
// Null and undefined both become an empty field — a CSV has no way to say "null"
// that a spreadsheet would not read as the four-letter word.
// Accepts a CsvValue.
// Returns the escaped field text, without a trailing separator.
const formatCell = (value: CsvValue): string => {
  if (value === null || value === undefined) return "";

  if (typeof value === "number") {
    // Non-finite numbers have no CSV spelling a spreadsheet would parse back as
    // a number, so they are written as blanks rather than the string "NaN".
    return Number.isFinite(value) ? String(value) : "";
  }

  if (typeof value === "boolean") return value ? "true" : "false";

  // Only strings get the formula guard: a legitimately negative number must keep
  // its leading minus sign and is not user-authored anyway.
  const text = FORMULA_TRIGGER.test(value) ? `'${value}` : value;

  return NEEDS_QUOTING.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Documentation only: Serializes rows to a CSV document with a header line.
// Columns are given explicitly rather than derived from the rows so the column
// order is stable and a row that happens to be missing a key still lines up.
// Accepts rows (CsvRow[]) and columns (string[]) — the header names, which double
// as the lookup keys into each row.
// Returns the complete CSV text. A zero-row export still emits its header line,
// which is what tells the recipient the export ran and found nothing.
export const toCsv = (
  rows: readonly CsvRow[],
  columns: readonly string[]
): string => {
  const lines = [columns.map(formatCell).join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => formatCell(row[column])).join(","));
  }

  return lines.join("\r\n");
};

// A UTF-8 byte order mark. Excel on Windows assumes the legacy ANSI codepage for
// a .csv without one, which turns every ₱ and é in the file into mojibake.
export const UTF8_BOM = "\uFEFF";
