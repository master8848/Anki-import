/**
 * createClient factory (R2).
 *
 * Replaces the dozen call-sites that all do the same:
 *
 *     new AnkiConnectClient({
 *       url: args.url,
 *       fetchImpl: opts.fetchImpl,
 *     });
 *
 * with one helper. The factory also resolves --profile to the right
 * AnkiConnect URL when --profile is set on the CLI.
 */

import { AnkiConnectClient } from "../anki-connect.ts";
import type { ParsedArgs } from "./args.ts";
import { resolveUrl } from "../profile.ts";

export async function createClient(args: ParsedArgs): Promise<AnkiConnectClient> {
  const url = await resolveUrl(args.profile);
  return new AnkiConnectClient({ url });
}