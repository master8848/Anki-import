/**
 * AnkiConnect error classification.
 *
 * Turns raw fetch failures into actionable, machine-readable diagnostics
 * so both humans and AI agents know *why* AnkiConnect is unreachable and
 * what to do next.
 */

import { ankiLaunchCommand } from "./launch.ts";

export const ANKICONNECT_ADDON_CODE = "2055492159";
export const ANKICONNECT_PLUS_CODE = "2036732292";
export const DEFAULT_URL = "http://127.0.0.1:8765";

export type ConnectCause =
  | "refused"
  | "timeout"
  | "http"
  | "bad-json"
  | "network"
  | "ok"
  | "unknown";

export interface ConnectDiagnosis {
  /** Whether an AnkiConnect request succeeded. */
  reachable: boolean;
  /** Machine-readable cause. Branch on this, never on message text. */
  cause: ConnectCause;
  url: string;
  detail: string;
  /** Ordered, actionable steps for a human or agent to run. */
  hints: string[];
  /** Suggested follow-up command, if any. */
  suggestion?: string;
}

/** Hints for "connection refused" — Anki is not running. Platform-aware. */
function refusedHints(): string[] {
  const { command, alternatives } = ankiLaunchCommand();
  const launch = alternatives.length > 0 ? `${command} (or ${alternatives.join(", ")})` : command;
  return [
    `Start the Anki app: ${launch}`,
    `Or run: anki-import open`,
    `Need AnkiConnect? In Anki: Tools → Add-ons → Get Add-ons → ${ANKICONNECT_ADDON_CODE} (AnkiConnect) or ${ANKICONNECT_PLUS_CODE} (AnkiConnect Plus) — either is ok, default is ${ANKICONNECT_ADDON_CODE} (more stable)`,
    `After installing, restart Anki.`,
    `Wrong address? Anki uses ${DEFAULT_URL} by default. Use --url if yours is different.`,
  ];
}

const REFUSED_HINTS = refusedHints();

const TIMEOUT_HINTS = [
  `Anki is open but not responding. It may be busy.`,
  `Wait a bit and try again, or restart Anki.`,
  `Still stuck? Reinstall AnkiConnect: Tools → Add-ons → ${ANKICONNECT_ADDON_CODE} (or ${ANKICONNECT_PLUS_CODE} — either is ok, default is ${ANKICONNECT_ADDON_CODE}).`,
];

const HTTP_HINTS = [
  `Got an HTTP error — the address may point to the wrong app.`,
  `Check AnkiConnect's port in Anki, then use --url to match it.`,
];

const BAD_JSON_HINTS = [
  `Something else is using that port — not Anki.`,
  `Run anki-import doctor, or fix the port in Anki and use --url.`,
];

const NETWORK_HINTS = [
  `Can't reach that address. Check the URL and your network.`,
  `Anki only listens on this computer. For another computer, use a tunnel.`,
  `Run anki-import doctor to check.`,
];

function nodeCode(err: unknown): string | undefined {
  if (err instanceof Error && "cause" in err) {
    const cause = err.cause;
    if (cause !== null && typeof cause === "object") {
      return (cause as { code?: string }).code;
    }
  }
  return undefined;
}

/**
 * Build a diagnosis for a failure whose cause is known at the throw
 * site (HTTP status / malformed body) — never infer causes from
 * message text (AGENTS.md #9).
 */
export function connectDiagnosis(
  cause: "http" | "bad-json",
  url: string,
  detail: string,
): ConnectDiagnosis {
  return {
    reachable: false,
    cause,
    url,
    detail,
    hints: cause === "http" ? HTTP_HINTS : BAD_JSON_HINTS,
    suggestion: "anki-import doctor",
  };
}

/** Classify a thrown fetch error against AnkiConnect. */
export function classifyConnectError(err: unknown, url: string): ConnectDiagnosis {
  const code = nodeCode(err);
  const msg = err instanceof Error ? err.message : String(err);

  if (code === "ECONNREFUSED" || code === "EPIPE" || code === "ECONNRESET") {
    return {
      reachable: false,
      cause: "refused",
      url,
      detail: `Can't connect to ${url}${code ? ` (${code})` : ""} — Anki may be closed.`,
      hints: REFUSED_HINTS,
      suggestion: "anki-import open",
    };
  }
  if (code === "ETIMEDOUT" || code === "EAI_AGAIN" || (err instanceof Error && err.name === "AbortError")) {
    return {
      reachable: false,
      cause: "timeout",
      url,
      detail: `Anki didn't answer at ${url}${code ? ` (${code})` : ""}.`,
      hints: TIMEOUT_HINTS,
      suggestion: "anki-import doctor",
    };
  }
  if (code === "ENOTFOUND" || code === "EHOSTUNREACH" || code === "EADDRNOTAVAIL") {
    return {
      reachable: false,
      cause: "network",
      url,
      detail: `Can't find ${url} (${code}). Check the address.`,
      hints: NETWORK_HINTS,
      suggestion: "anki-import doctor",
    };
  }
  return {
    reachable: false,
    cause: "unknown",
    url,
    detail: `Can't reach Anki at ${url}: ${msg}`,
    hints: [`Run anki-import doctor to check.`],
    suggestion: "anki-import doctor",
  };
}
