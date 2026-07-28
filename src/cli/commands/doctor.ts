/**
 * `doctor` command — verify the environment is ready.
 */

import { runDoctor } from "../../doctor.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

const command: Command = {
  name: "doctor",
  description: "Verify AnkiConnect is reachable and the collection is usable.",
  flags: {},
  parseSubArgs() {
    return {};
  },
  async run(args) {
    return withFatal(async () => {
      const startMs = Date.now();
      const result = await runDoctor({ ankiConnectUrl: args.url });
      const data = {
        url: result.url,
        ok: result.ok,
        checks: result.checks,
      };
      const human = [
        `URL: ${result.url}`,
        ...result.checks.map((c) => `  ${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`),
      ].join("\n");
      console.log(formatOutput(data, { args, startMs, command: "doctor" }, human));
      return result.ok ? 0 : 1;
    });
  },
};

export default command;