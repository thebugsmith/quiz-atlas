/**
 * The feature boundary for exam mode.
 *
 * Exam mode is built in place, behind a flag: the nav entry, the routes and the API
 * surface all read this value, so an unfinished step is never presented as finished.
 * It is `NEXT_PUBLIC_` because the server and the client navigation must agree; the
 * flag is inlined at build time, so flipping it needs a rebuild, not a runtime lookup.
 *
 *   NEXT_PUBLIC_EXAM_MODE=1 pnpm dev
 */
export const examModeEnabled = process.env.NEXT_PUBLIC_EXAM_MODE === "1";
