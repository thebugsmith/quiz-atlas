import { z } from "zod";

/**
 * The exam paper import contract.
 *
 * One manifest is one sitting: catalog identity, the ordered item list, the marking and
 * timing rules, and the provenance of the document it was built from. The private key is
 * a separate file so it never travels with the paper file and never reaches a browser.
 *
 * Everything is validated here before a single row is written. The rules are deliberately
 * finite — no expression strings, no executable policy — because an import must not be
 * able to invent a grading rule the app cannot explain on a result screen.
 */

export const RATIONAL = /^-?[0-9]{1,9}(?:\/[1-9][0-9]{0,3})?$/;
/** A numerical answer bound: a plain decimal, negative allowed. */
export const DECIMAL = /^-?[0-9]{1,9}(?:\.[0-9]{1,6})?$/;

const rational = z.string().regex(RATIONAL, "expected an exact rational such as 4, -1 or -2/3");
const decimalString = z.string().regex(DECIMAL, "expected a decimal such as 12 or 1.41");

const option = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,16}$/),
    text: z.string().trim().min(1).max(1000),
  })
  .strict();

export const itemType = z.enum(["single_choice", "multiple_select", "numerical"]);

export const manifestItem = z
  .object({
    item_id: z.string().min(1).max(120),
    type: itemType,
    section: z.string().min(1),
    prompt: z.string().trim().min(5).max(4000),
    options: z.array(option).min(2).max(10).optional(),
    input: z
      .object({
        kind: z.enum(["integer", "decimal"]),
        max_decimal_places: z.number().int().min(0).max(6).optional(),
      })
      .strict()
      .optional(),
    explanation: z.string().trim().min(5).max(4000).optional(),
    marking: z
      .object({
        correct: rational.optional(),
        incorrect: rational.optional(),
        unattempted: rational.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    const ids = new Set<string>();
    for (const current of item.options ?? []) {
      if (ids.has(current.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate option id ${current.id}`,
          path: ["options"],
        });
      }
      ids.add(current.id);
    }
    if (item.type === "numerical") {
      if (item.options?.length) {
        ctx.addIssue({
          code: "custom",
          message: "a numerical item has no options",
          path: ["options"],
        });
      }
      if (!item.input) {
        ctx.addIssue({
          code: "custom",
          message: "a numerical item needs input policy",
          path: ["input"],
        });
      }
      return;
    }
    if (!item.options?.length) {
      ctx.addIssue({ code: "custom", message: "a choice item needs options", path: ["options"] });
    }
    if (item.input) {
      ctx.addIssue({
        code: "custom",
        message: "only numerical items have input policy",
        path: ["input"],
      });
    }
  });

export const section = z
  .object({
    id: z.string().min(1).max(60),
    title: z.string().trim().min(1).max(120),
    position: z.number().int().min(1).optional(),
  })
  .strict();

export const rule = z
  .object({
    timing: z
      .object({
        kind: z.enum(["whole_paper", "sections"]),
        duration_seconds: z.number().int().min(1).max(60000).optional(),
        sections: z
          .array(
            z.object({ section: z.string(), duration_seconds: z.number().int().min(1) }).strict(),
          )
          .optional(),
      })
      .strict(),
    marking: z
      .object({
        correct: rational,
        incorrect: rational,
        unattempted: rational,
        partial: z
          .object({
            policy: z.enum(["none", "correct_subset_count", "proportional", "all_or_nothing"]),
            points_by_count: z.record(z.string().regex(/^[0-9]{1,2}$/), rational).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    navigation: z.object({ kind: z.enum(["free", "sequential"]) }).strict(),
    choices: z
      .object({ max_questions: z.number().int().min(1).max(500).optional() })
      .strict()
      .optional(),
    display: z
      .object({ rounding: z.enum(["none", "half_up"]), places: z.number().int().min(0).max(2) })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.timing.kind === "whole_paper" && !value.timing.duration_seconds) {
      ctx.addIssue({
        code: "custom",
        message: "whole_paper timing needs duration_seconds",
        path: ["timing"],
      });
    }
    if (value.timing.kind === "sections" && !value.timing.sections?.length) {
      ctx.addIssue({
        code: "custom",
        message: "sections timing needs per-section durations",
        path: ["timing"],
      });
    }
    if (
      value.marking.partial?.policy === "correct_subset_count" &&
      !value.marking.partial.points_by_count
    ) {
      ctx.addIssue({
        code: "custom",
        message: "correct_subset_count needs points_by_count",
        path: ["marking"],
      });
    }
  });

export const manifest = z
  .object({
    development_only: z.boolean().default(false),
    exam: z
      .object({
        slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        name: z.string().trim().min(2).max(80),
        family: z.string().max(40).optional(),
        authority: z
          .object({
            slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
            name: z.string().trim().min(2).max(80),
            kind: z
              .enum(["national_body", "state_commission", "board", "other"])
              .default("national_body"),
          })
          .strict()
          .optional(),
      })
      .strict(),
    edition: z
      .object({
        code: z.string().min(1).max(24),
        label: z.string().trim().min(1).max(80),
        held_from: z.string().date().optional(),
        held_to: z.string().date().optional(),
      })
      .strict(),
    stage: z
      .object({
        code: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        name: z.string().trim().min(2).max(80),
        position: z.number().int().min(1).optional(),
      })
      .strict(),
    paper: z
      .object({
        slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        year: z.number().int().min(1950).max(2100),
        paper_code: z.string().max(40).optional(),
        session_label: z.string().max(40).optional(),
        shift_label: z.string().max(40).optional(),
        paper_label: z.string().max(80).optional(),
        administration: z.enum(["regular", "retest", "cancelled"]).default("regular"),
        duration_seconds: z.number().int().min(60).max(60000).optional(),
        supported_types: z.array(itemType).min(1),
        status: z.enum(["draft", "published"]).default("draft"),
        source_status: z.enum(["official_verified", "reviewed_reconstruction", "synthetic"]),
      })
      .strict(),
    rule,
    sections: z.array(section).min(1),
    items: z.array(manifestItem).min(1),
    source: z
      .object({
        kind: z.enum(["official_paper", "official_key", "notice", "syllabus", "other"]),
        url: z.string().url().optional(),
        sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        pages: z.number().int().min(1).optional(),
        retrieved_at: z.string().datetime().optional(),
        rights_note: z.string().max(500).optional(),
        review_status: z.enum(["pending", "verified", "rejected"]).default("pending"),
      })
      .strict()
      .optional(),
    private_key_file: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const sectionIds = new Set<string>();
    for (const entry of value.sections) {
      if (sectionIds.has(entry.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate section ${entry.id}`,
          path: ["sections"],
        });
      }
      sectionIds.add(entry.id);
    }

    const itemIds = new Set<string>();
    for (const item of value.items) {
      if (itemIds.has(item.item_id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate item ${item.item_id}`,
          path: ["items"],
        });
      }
      itemIds.add(item.item_id);
      if (!sectionIds.has(item.section)) {
        ctx.addIssue({
          code: "custom",
          message: `unknown section ${item.section}`,
          path: ["items"],
        });
      }
      if (!value.paper.supported_types.includes(item.type)) {
        ctx.addIssue({
          code: "custom",
          message: `paper does not declare ${item.type} in supported_types`,
          path: ["items"],
        });
      }
    }

    for (const sectionRule of value.rule.timing.sections ?? []) {
      if (!sectionIds.has(sectionRule.section)) {
        ctx.addIssue({
          code: "custom",
          message: `timing for unknown section`,
          path: ["rule", "timing"],
        });
      }
    }

    // A fixture must never be publishable as a real paper.
    if (value.paper.source_status === "synthetic" && value.paper.status === "published") {
      ctx.addIssue({
        code: "custom",
        message: "synthetic content cannot be published",
        path: ["paper", "status"],
      });
    }
    if (value.paper.status === "published" && value.source?.review_status !== "verified") {
      ctx.addIssue({
        code: "custom",
        message: "publishing needs a verified source",
        path: ["source"],
      });
    }

    // Real content has to be traceable to a document: a URL or a file hash.
    if (
      value.paper.source_status !== "synthetic" &&
      (!value.source || (!value.source.url && !value.source.sha256))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "non-synthetic content needs a source url or sha256",
        path: ["source"],
      });
    }
  });

export const keyItem = z
  .object({
    accepted_option_ids: z.array(z.string()).min(1).optional(),
    correct_option_ids: z.array(z.string()).min(1).optional(),
    accepted_numeric_intervals: z
      .array(
        z
          .object({
            min: decimalString,
            max: decimalString,
            min_inclusive: z.boolean().default(true),
            max_inclusive: z.boolean().default(true),
          })
          .strict(),
      )
      .min(1)
      .optional(),
    exceptional_policy: z.enum(["exclude", "award_all", "award_attempted"]).optional(),
  })
  .strict();

export const privateKey = z
  .object({
    development_only: z.boolean().default(false),
    private_server_only: z.boolean().default(true),
    paper_external_id: z.string().min(1),
    key_version: z.number().int().min(1),
    items: z.record(z.string(), keyItem),
  })
  .strict();

export type Manifest = z.infer<typeof manifest>;
export type PrivateKey = z.infer<typeof privateKey>;
export type ManifestItem = z.infer<typeof manifestItem>;

export type ImportProblem = { path: string; message: string };

function intervalValue(value: string): number {
  const [numerator, denominator] = value.split("/").map(Number);
  return denominator ? numerator / denominator : numerator;
}

/**
 * Cross-file validation: the key has to answer exactly the items the paper asks, in the
 * shape each item's type implies, using option ids that item actually printed.
 */
export function keyProblems(paper: Manifest, key: PrivateKey): ImportProblem[] {
  const found: ImportProblem[] = [];

  if (key.paper_external_id !== paper.paper.slug) {
    found.push({
      path: "key.paper_external_id",
      message: `key answers ${key.paper_external_id}, manifest is ${paper.paper.slug}`,
    });
  }

  const items = new Map(paper.items.map((item) => [item.item_id, item]));

  for (const itemId of items.keys()) {
    if (!key.items[itemId]) {
      found.push({ path: `key.items.${itemId}`, message: "item has no key entry" });
    }
  }

  for (const [itemId, entry] of Object.entries(key.items)) {
    const item = items.get(itemId);
    if (!item) {
      found.push({
        path: `key.items.${itemId}`,
        message: "key answers an item the paper does not contain",
      });
      continue;
    }

    const optionIds = new Set((item.options ?? []).map((option) => option.id));

    if (entry.exceptional_policy === "exclude" || entry.exceptional_policy === "award_all") {
      const extra =
        entry.accepted_option_ids ?? entry.correct_option_ids ?? entry.accepted_numeric_intervals;
      if (extra) {
        found.push({
          path: `key.items.${itemId}`,
          message: `${entry.exceptional_policy} items do not carry answers`,
        });
      }
      continue;
    }

    if (item.type === "single_choice") {
      if (!entry.accepted_option_ids) {
        found.push({
          path: `key.items.${itemId}`,
          message: "single_choice needs accepted_option_ids",
        });
      }
      for (const id of entry.accepted_option_ids ?? []) {
        if (!optionIds.has(id)) {
          found.push({
            path: `key.items.${itemId}`,
            message: `accepted option ${id} was never printed`,
          });
        }
      }
      if (entry.correct_option_ids || entry.accepted_numeric_intervals) {
        found.push({
          path: `key.items.${itemId}`,
          message: "single_choice has only accepted_option_ids",
        });
      }
    }

    if (item.type === "multiple_select") {
      if (!entry.correct_option_ids) {
        found.push({
          path: `key.items.${itemId}`,
          message: "multiple_select needs correct_option_ids",
        });
      }
      for (const id of entry.correct_option_ids ?? []) {
        if (!optionIds.has(id)) {
          found.push({
            path: `key.items.${itemId}`,
            message: `correct option ${id} was never printed`,
          });
        }
      }
      if (entry.accepted_option_ids || entry.accepted_numeric_intervals) {
        found.push({
          path: `key.items.${itemId}`,
          message: "multiple_select has only correct_option_ids",
        });
      }
    }

    if (item.type === "numerical") {
      if (!entry.accepted_numeric_intervals) {
        found.push({
          path: `key.items.${itemId}`,
          message: "numerical needs accepted_numeric_intervals",
        });
      }
      for (const interval of entry.accepted_numeric_intervals ?? []) {
        if (intervalValue(interval.min) > intervalValue(interval.max)) {
          found.push({ path: `key.items.${itemId}`, message: "interval min is above max" });
        }
      }
      if (entry.accepted_option_ids || entry.correct_option_ids) {
        found.push({
          path: `key.items.${itemId}`,
          message: "numerical answers with intervals, not option ids",
        });
      }
    }
  }

  return found;
}
