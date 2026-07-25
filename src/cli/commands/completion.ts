/**
 * `completion` command — print shell completion scripts.
 */

import { generateCompletion, SUPPORTED_SHELLS, type SupportedShell } from "../../completion.ts";
import type { Command } from "../command.ts";
import { withFatal, writeStdout } from "../output.ts";

export interface CompletionSubArgs {
  shell: string | null;
}

const command: Command<CompletionSubArgs> = {
  name: "completion",
  description: "Print a shell completion script (bash, zsh, fish, powershell).",
  flags: {
    "<shell>": `One of: ${SUPPORTED_SHELLS.join(", ")}.`,
  },
  parseSubArgs(positional) {
    return { shell: positional[0] ?? null };
  },
  async run(_args, sub) {
    if (!sub.shell) {
      console.error(`error: missing <shell> argument.`);
      console.error(`Usage: anki-xml completion <${SUPPORTED_SHELLS.join("|")}>`);
      return 2;
    }
    if (!SUPPORTED_SHELLS.includes(sub.shell as SupportedShell)) {
      console.error(
        `error: unknown shell '${sub.shell}'. Supported: ${SUPPORTED_SHELLS.join(", ")}`,
      );
      return 2;
    }
    return withFatal(async () => {
      writeStdout(generateCompletion(sub.shell as SupportedShell));
      return 0;
    });
  },
};

export default command;
