import "server-only";
import { rpc } from "@/features/quiz/api-helpers";

/**
 * Catalog reads for the exam library. The bank lives in the private `content` schema, so
 * these functions ask the database for a constructed summary instead of reading tables.
 * Nothing here returns item text or a key.
 */

export type PaperStatus = "draft" | "published";
export type KeyStatus = "published" | "draft" | "embedded" | "missing";

export type ExamPaperSummary = {
  slug: string;
  year: number;
  paper_code: string | null;
  paper_label: string | null;
  session_label: string | null;
  shift_label: string | null;
  administration: "regular" | "retest" | "cancelled";
  status: PaperStatus;
  source_status: "official_verified" | "reviewed_reconstruction" | "synthetic";
  supported_types: ("single_choice" | "multiple_select" | "numerical")[];
  question_count: number | null;
  duration_seconds: number | null;
  marks_correct: number | string | null;
  marks_wrong: number | string | null;
  max_marks: number | string | null;
  edition: string | null;
  edition_code: string | null;
  stage: string | null;
  key_status: KeyStatus;
  locales: string[];
  sections: PaperSection[];
};

export type ExamSummary = {
  slug: string;
  name: string;
  family: string | null;
  authority: string | null;
  editions: { code: string; label: string; held_from: string | null; held_to: string | null }[];
  papers: ExamPaperSummary[];
  paper_count: number;
  years: number[];
  question_count: number;
};

export type PaperSection = { id: string; subject: string; position: number; items: number };

export type PaperRule = {
  timing: { kind: "whole_paper" | "sections"; duration_seconds?: number; sections?: unknown[] };
  marking: {
    correct: string;
    incorrect: string;
    unattempted: string;
    partial?: { policy: string; points_by_count?: Record<string, string> };
  };
  navigation: { kind: "free" | "sequential" };
  choices: { max_questions?: number };
  display: { rounding: "none" | "half_up"; places: number };
  status: "draft" | "published" | "superseded";
  version: number;
};

export type PaperDetail = {
  slug: string;
  year: number;
  paper_code: string | null;
  paper_label: string | null;
  shift_label: string | null;
  session_label: string | null;
  exam_date: string | null;
  administration: "regular" | "retest" | "cancelled";
  status: PaperStatus;
  source_status: "official_verified" | "reviewed_reconstruction" | "synthetic";
  supported_types: ("single_choice" | "multiple_select" | "numerical")[];
  question_count: number | null;
  duration_seconds: number | null;
  marks_correct: number | string | null;
  marks_wrong: number | string | null;
  max_marks: number | string | null;
  exam: { slug: string; name: string; family: string | null };
  authority: string | null;
  edition: { code: string; label: string } | null;
  stage: { code: string; name: string } | null;
  key_status: KeyStatus;
  sections: PaperSection[];
  items: number;
  locales: { locale: string; status: string }[];
  locales_available: string[];
  rule: PaperRule | null;
};

export async function getExamCatalog(): Promise<ExamSummary[]> {
  const { data } = await rpc<ExamSummary[]>("exam_catalog", {});
  return Array.isArray(data) ? data : [];
}

export async function getPaperDetail(slug: string): Promise<PaperDetail | null> {
  const { data } = await rpc<PaperDetail | null>("exam_paper_detail", { p_slug: slug });
  return data ?? null;
}

/** "1 h 30 min", or null when the paper has no declared duration. */
export function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function paperIdentity(paper: {
  edition: string | null;
  stage: string | null;
  paper_code: string | null;
  shift_label: string | null;
}): string {
  return [paper.edition, paper.stage, paper.paper_code ?? null, paper.shift_label]
    .filter(Boolean)
    .join(" · ");
}
