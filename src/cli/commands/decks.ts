/**
 * `decks` command — list decks and total card counts.
 */

import { fetchDeckReport, renderDeckTree } from "../../decks.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

const command: Command = {
  name: "decks",
  description: "List all decks and total card counts.",
  async run(args) {
    return withFatal(async () => {
      const report = await fetchDeckReport({ ankiConnectUrl: args.url });
      const human = (() => {
        const totalDecks = report.flat.length;
        const totalCards = report.flat.reduce((s, d) => s + d.totalCards, 0);
        const s = `${totalDecks} deck${totalDecks === 1 ? "" : "s"}, ${totalCards} total card${totalCards === 1 ? "" : "s"}\n\n`;
        return s + renderDeckTree(report.tree);
      })();
      console.log(formatOutput(report.flat, { args }, human));
      return 0;
    });
  },
};

export default command;
