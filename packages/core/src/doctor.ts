/**
 * Environment checks — AnkiConnect reachability and collection health.
 *
 * Every failing check carries `hints`: ordered, actionable steps for
 * humans and AI agents (install the add-on, open Anki, restart, ...).
 */

import { AnkiClient, ANKICONNECT_ADDON_CODE } from "@anki-xml/anki";
import type { ConnectDiagnosis } from "@anki-xml/anki";

export const MATHJAX_ADDON_CODE = "1610307553";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  /** Actionable fix steps when the check fails. */
  hints: string[];
  /** Suggested follow-up command, if any. */
  suggestion?: string;
}

export interface DoctorOptions {
  url?: string;
  fetchImpl?: typeof fetch;
}

export interface DoctorResult {
  url: string;
  checks: DoctorCheck[];
  ok: boolean;
}

export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorResult> {
  const url = opts.url ?? "http://127.0.0.1:8765";
  const client = new AnkiClient({ url, fetchImpl: opts.fetchImpl, retries: 1 });
  const checks: DoctorCheck[] = [];

  const diag: ConnectDiagnosis = await client.diagnose();

  if (!diag.reachable) {
    checks.push({
      name: "anki-connect-reachable",
      ok: false,
      detail: diag.detail,
      hints: diag.hints,
      suggestion: diag.suggestion,
    });
    return { url, checks, ok: false };
  }
  checks.push({
    name: "anki-connect-reachable",
    ok: true,
    detail: diag.detail,
    hints: [],
  });

  try {
    const version = await client.version();
    checks.push({
      name: "anki-connect-version",
      ok: version >= 6,
      detail:
        version >= 6
          ? `API version ${version} is supported (we speak v6)`
          : `API version ${version} is too old (need ≥ 6)`,
      hints:
        version >= 6
          ? []
          : [
              `Update AnkiConnect: Tools → Add-ons → Check for Updates.`,
              `If it still reports an old API, reinstall the add-on (code ${ANKICONNECT_ADDON_CODE}) and restart Anki.`,
            ],
    });
  } catch (err) {
    checks.push({
      name: "anki-connect-version",
      ok: false,
      detail: (err as Error).message,
      hints: [`Restart Anki and re-run "anki-import doctor".`],
    });
  }

  try {
    const decks = await client.deckNames();
    checks.push({
      name: "collection-has-decks",
      ok: decks.length > 0,
      detail: decks.length > 0 ? `${decks.length} deck(s)` : "no decks found",
      hints:
        decks.length > 0
          ? []
          : [
              `Create a deck in Anki (right-click a deck list → Create Deck) or import one.`,
              `Anki-import can auto-create decks during import, but the collection must be writable.`,
            ],
    });
  } catch (err) {
    checks.push({
      name: "collection-has-decks",
      ok: false,
      detail: (err as Error).message,
      hints: [`Run "anki-import doctor" after restarting Anki.`],
    });
  }

  try {
    const models = await client.modelNames();
    checks.push({
      name: "collection-has-models",
      ok: models.length > 0,
      detail: models.length > 0 ? `${models.length} model(s)` : "no models found",
      hints:
        models.length > 0
          ? []
          : [
              `Anki ships with default note types; if the collection has none, create one in Anki's Tools → Manage Note Types.`,
            ],
    });
  } catch (err) {
    checks.push({
      name: "collection-has-models",
      ok: false,
      detail: (err as Error).message,
      hints: [`Run "anki-import doctor" after restarting Anki.`],
    });
  }

  try {
    const addons = await client.getAddons();
    checks.push({
      name: "addons-queryable",
      ok: true,
      detail: `${Object.keys(addons).length} add-on(s)`,
      hints: [],
    });
    const mathjax = addons[MATHJAX_ADDON_CODE] === true;
    checks.push({
      name: "mathjax-addon-installed",
      ok: mathjax,
      detail: mathjax
        ? "MathJax add-on enabled"
        : `MathJax (${MATHJAX_ADDON_CODE}) not enabled — use [latex]...[/latex] or install it`,
      hints: mathjax
        ? []
        : [
            `Install the MathJax add-on in Anki: Tools → Add-ons → Get Add-ons → ${MATHJAX_ADDON_CODE}.`,
            `Optional — only needed if your notes use LaTeX/math notation.`,
          ],
    });
  } catch (err) {
    const msg = (err as Error).message;
    checks.push({
      name: "addons-queryable",
      ok: false,
      detail: msg,
      hints: [
        `AnkiConnect could not list add-ons — usually an old AnkiConnect build.`,
        `Update AnkiConnect (Tools → Add-ons → Check for Updates) and restart Anki.`,
      ],
    });
  }

  return { url, checks, ok: checks.every((c) => c.ok) };
}
