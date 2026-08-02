/**
 * Built-in exporters. JSON is the default — XML remains canonical for
 * input; exports are read-only serializations for tools and agents.
 */

import type { ExporterPlugin } from "./types.ts";
import type { ValidatedNote } from "@anki-xml/utils";

export const JsonExporterPlugin: ExporterPlugin = {
  name: "json",
  supports: (format: string): boolean => format.toLowerCase() === "json",
  export(notes: ValidatedNote[]): string {
    return JSON.stringify(
      {
        notes: notes.map((n) => ({
          number: n.number,
          ...(n.id !== undefined ? { id: n.id } : {}),
          deck: n.deckName,
          model: n.modelName,
          tags: n.tags.join(" "),
          fields: n.fields,
        })),
      },
      null,
      2,
    );
  },
};
