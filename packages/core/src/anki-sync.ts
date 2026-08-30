import { AnkiClient, AnkiConnectError } from "@anki-xml/anki";
import type { ConnectDiagnosis } from "@anki-xml/anki";

export interface AnkiSyncOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  /** If true, only check reachability/auth without triggering a sync. */
  checkOnly?: boolean;
}

export interface AnkiSyncResult {
  ok: boolean;
  reachable: boolean;
  authenticated: boolean;
  synced: boolean;
  url: string;
  cause: string;
  detail: string;
  hints: string[];
  suggestion?: string;
  diagnosis?: ConnectDiagnosis;
}

function isSyncRequiredMessage(msg: string): boolean {
  return /sync status|full sync|upload|download/i.test(msg) && !/auth/i.test(msg);
}

export async function runAnkiSync(opts: AnkiSyncOptions = {}): Promise<AnkiSyncResult> {
  const url = opts.url ?? "http://127.0.0.1:8765";
  const client = new AnkiClient({ url, fetchImpl: opts.fetchImpl, retries: 1 });

  const diag = await client.diagnose();
  if (!diag.reachable) {
    return {
      ok: false,
      reachable: false,
      authenticated: false,
      synced: false,
      url,
      cause: diag.cause,
      detail: diag.detail,
      hints: diag.hints,
      suggestion: diag.suggestion,
      diagnosis: diag,
    };
  }

  if (opts.checkOnly) {
    return {
      ok: true,
      reachable: true,
      authenticated: true,
      synced: true,
      url,
      cause: "ok",
      detail: `AnkiConnect reachable at ${url} (check only — run without --check to trigger AnkiWeb sync)`,
      hints: [],
      suggestion: undefined,
    };
  }

  try {
    await client.sync();
    return {
      ok: true,
      reachable: true,
      authenticated: true,
      synced: true,
      url,
      cause: "ok",
      detail: "Synced with AnkiWeb — cards will appear on phone after phone syncs.",
      hints: [],
      suggestion: undefined,
    };
  } catch (err) {
    if (err instanceof AnkiConnectError) {
      const msg = err.message;
      // Already classified as auth in AnkiClient.sync()
      if (err.cause === "auth" || err.diagnosis?.cause === "auth") {
        const d = err.diagnosis!;
        return {
          ok: false,
          reachable: true,
          authenticated: false,
          synced: false,
          url,
          cause: "auth",
          detail: d.detail,
          hints: d.hints,
          suggestion: d.suggestion,
          diagnosis: d,
        };
      }
      if (isSyncRequiredMessage(msg)) {
        return {
          ok: false,
          reachable: true,
          authenticated: true,
          synced: false,
          url,
          cause: "sync-required",
          detail: msg,
          hints: ["Open Anki and resolve the full-sync prompt (choose Upload or Download).", "After resolving, run: anki-import anki-sync"],
          suggestion: undefined,
        };
      }
      // Generic sync error but still authenticated
      return {
        ok: false,
        reachable: true,
        authenticated: true,
        synced: false,
        url,
        cause: err.cause ?? "unknown",
        detail: msg,
        hints: err.hints ?? [],
        suggestion: err.suggestion,
        diagnosis: err.diagnosis,
      };
    }
    throw err;
  }
}
