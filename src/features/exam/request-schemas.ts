import { z } from "zod";

/**
 * Request contracts for the exam attempt API. A response is a discriminated union by
 * kind, which is what lets one endpoint accept a radio answer, a checkbox set and a
 * numeric string without guessing from the item.
 */
export const responseValue = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("single"), option_id: z.string().max(16).nullable() }).strict(),
  z
    .object({ kind: z.literal("multiple"), option_ids: z.array(z.string().max(16)).max(10) })
    .strict(),
  z.object({ kind: z.literal("numerical"), value: z.string().max(20).nullable() }).strict(),
]);

export const responsePatch = z
  .object({
    response: responseValue.nullable(),
    expected_revision: z.number().int().min(0),
    mutation_key: z.string().min(8).max(100),
  })
  .strict();

export const createAttempt = z
  .object({
    paper: z.string().min(1).max(120),
    mode: z.enum(["study", "timed"]),
    create_key: z.string().min(8).max(100),
    /** Paper sections to practise; omitted means the whole paper. */
    sections: z.array(z.string().uuid()).max(20).optional(),
    locale: z
      .string()
      .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
      .optional(),
  })
  .strict();

export const cursorPatch = z
  .object({
    item_id: z.string().uuid().optional(),
    locale: z
      .string()
      .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
      .optional(),
  })
  .strict();

export const markedPatch = z.object({ item_id: z.string().uuid(), marked: z.boolean() }).strict();
