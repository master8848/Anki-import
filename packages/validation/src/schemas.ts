/**
 * Valibot schemas for note validation.
 * Line-aware errors are attached by the validator layer after schema checks.
 */

import * as v from "valibot";

export const FieldSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, "Field name is required")),
  html: v.string(),
  displayName: v.optional(v.string()),
});

export const NoteSchema = v.object({
  number: v.number(),
  type: v.pipe(v.string(), v.minLength(1, "Missing type attribute on <note>")),
  deck: v.string(),
  tags: v.string(),
  fields: v.array(FieldSchema),
  id: v.optional(v.pipe(v.number(), v.minValue(1))),
  line: v.optional(v.number()),
  sourceOffset: v.optional(v.number()),
  fieldSourceOffsets: v.optional(v.array(v.number())),
  unknownElements: v.optional(v.array(v.string())),
});

export type NoteSchemaInput = v.InferInput<typeof NoteSchema>;
