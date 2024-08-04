/**
 * Minimal RFC 4180 reader for admin uploads: quoted fields, escaped quotes, CRLF.
 * Headers become object keys, so a spreadsheet export can be validated by the same
 * Zod schema as the JSON authoring files.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((line) => line.some((cell) => cell.trim() !== ""));
  if (!header) return [];

  return body.map((line) =>
    Object.fromEntries(header.map((key, index) => [key.trim(), (line[index] ?? "").trim()])),
  );
}

/**
 * Spreadsheets carry options and statements as text. This turns the flat cells into the
 * shape the validator expects, leaving any malformed value intact so the schema reports
 * it instead of silently dropping a column.
 */
export function csvRowToQuestion(row: Record<string, string>) {
  const options = [1, 2, 3, 4]
    .map((id) => ({ id, text: row[`option_${id}`] ?? "" }))
    .filter((option) => option.text !== "");

  const statements = (row.statements ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);

  return {
    external_id: row.external_id,
    topic: row.topic,
    difficulty: row.difficulty,
    type: row.type || "mcq",
    stem: row.stem || undefined,
    statements,
    prompt: row.prompt,
    options,
    correct_option_id: row.correct_option_id ? Number(row.correct_option_id) : undefined,
    explanation: row.explanation || undefined,
    added_at: row.added_at || undefined,
  };
}
