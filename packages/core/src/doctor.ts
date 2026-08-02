/**
 * Environment checks — AnkiConnect reachability and collection health.
 */

import { AnkiClient, AnkiConnectError } from "@anki-xml/anki";

export const MATHJAX_ADDON_CODE = "1610307553";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
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

  try {
    const version = await client.version();
    checks.push({
      name: "anki-connect-reachable",
      ok: true,
      detail: `connected to ${url}; AnkiConnect version ${version}`,
    });
    checks.push({
      name: "anki-connect-version",
      ok: version >= 5,
      detail:
        version >= 5
          ? `API version ${version} is supported`
          : `API version ${version} is too old (need ≥ 5)`,
    });
  } catch (err) {
    const detail =
      err instanceof AnkiConnectError
        ? `failed to reach ${url}: ${err.message}`
        : `failed to reach ${url}: ${(err as Error).message}`;
    checks.push({ name: "anki-connect-reachable", ok: false, detail });
    return { url, checks, ok: false };
  }

  try {
    const decks = await client.deckNames();
    checks.push({
      name: "collection-has-decks",
      ok: decks.length > 0,
      detail: decks.length > 0 ? `${decks.length} deck(s)` : "no decks found",
    });
  } catch (err) {
    checks.push({
      name: "collection-has-decks",
      ok: false,
      detail: (err as Error).message,
    });
  }

  try {
    const models = await client.modelNames();
    checks.push({
      name: "collection-has-models",
      ok: models.length > 0,
      detail: models.length > 0 ? `${models.length} model(s)` : "no models found",
    });
  } catch (err) {
    checks.push({
      name: "collection-has-models",
      ok: false,
      detail: (err as Error).message,
    });
  }

  try {
    const addons = await client.getAddons();
    checks.push({
      name: "addons-queryable",
      ok: true,
      detail: `${Object.keys(addons).length} add-on(s)`,
    });
    const mathjax = addons[MATHJAX_ADDON_CODE] === true;
    checks.push({
      name: "mathjax-addon-installed",
      ok: mathjax,
      detail: mathjax
        ? "MathJax add-on enabled"
        : `MathJax (${MATHJAX_ADDON_CODE}) not enabled — use [latex]...[/latex] or install it`,
    });
  } catch {
    checks.push({
      name: "addons-queryable",
      ok: false,
      detail: "AnkiConnect cannot query add-ons (older build?)",
    });
  }

  return { url, checks, ok: checks.every((c) => c.ok) };
}
