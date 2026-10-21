/** The safe manifest the solver receives. No keys, no correctness, only this attempt. */

export type ManifestOption = { id: string; label: string; text: string };

export type SavedResponse = {
  value: ResponseValue | null;
  revision: number;
  marked: boolean;
  visited: boolean;
  checked: boolean;
  revealed: boolean;
};

export type ResponseValue =
  | { kind: "single"; option_id: string | null }
  | { kind: "multiple"; option_ids: string[] }
  | { kind: "numerical"; value: string | null };

export type ManifestStimulus = {
  kind: "passage" | "table" | "diagram" | "case";
  body: string;
  media_path: string | null;
};

export type ManifestRule = {
  timing: { kind: "whole_paper" | "sections"; duration_seconds?: number };
  marking: {
    correct: string;
    incorrect: string;
    unattempted: string;
    partial?: { policy: string };
  };
  navigation: { kind: "free" | "sequential" };
  choices: { max_questions?: number };
  display: { rounding: string; places: number };
  version: number;
};

export type ManifestItem = {
  item_id: string;
  position: number;
  section: string | null;
  type: "single_choice" | "multiple_select" | "numerical";
  prompt: string;
  stem: string | null;
  statements: string[];
  options: ManifestOption[];
  input: { kind: "integer" | "decimal"; max_decimal_places?: number } | null;
  stimulus: ManifestStimulus | null;
  response: SavedResponse | null;
};

export type Manifest = {
  attempt_id: string;
  mode: "study" | "timed";
  state: "ready" | "active" | "paused" | "submitted" | "expired" | "abandoned";
  locale: string;
  cursor_item_id: string | null;
  started_at: string | null;
  deadline_at: string | null;
  server_now: string | null;
  paper: {
    slug: string;
    label: string | null;
    year: number;
    marks_correct: number | string | null;
    marks_wrong: number | string | null;
    duration_seconds: number | null;
  };
  items: ManifestItem[];
  rule: ManifestRule | null;
  answered: number;
  total: number;
};

export function isAnswered(item: ManifestItem): boolean {
  const value = item.response?.value;
  if (!value) return false;
  if (value.kind === "single") return Boolean(value.option_id);
  if (value.kind === "multiple") return value.option_ids.length > 0;
  return Boolean(value.value && value.value.trim() !== "");
}
