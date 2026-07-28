/**
 * `decks` command: list all decks and subdecks with their card counts.
 *
 * AnkiConnect returns a flat list of deck names using `Parent::Child`
 * separators. We parse that into a tree, query the total card count for
 * each (and the union of all subdecks), and emit either a human-friendly
 * tree or a flat JSON array.
 */

import { AnkiConnectClient } from "./anki-connect.ts";

export interface DeckNode {
  /** Just the leaf name (e.g. "Vocab"), not the full path. */
  name: string;
  /** Full hierarchical name (e.g. "Languages::Spanish::Vocab"). */
  fullName: string;
  /** Total card count for this deck *plus* all its descendants. */
  totalCards: number;
  /** Card count in this deck alone (not counting descendants). */
  ownCards: number;
  /** Anki's internal deck id, if AnkiConnect reported one. */
  deckId?: number;
  children: DeckNode[];
}

export interface DeckReportOptions {
  ankiConnectUrl: string;
  fetchImpl?: typeof fetch;
}

export interface DeckReport {
  /** Tree of decks, ordered the way Anki returns them. */
  tree: DeckNode[];
  /** Flat list of every deck in pre-order, with totals and own counts. */
  flat: { name: string; totalCards: number; ownCards: number; id?: number }[];
}

/**
 * Parse a flat list of `Parent::Child` deck names into a tree.
 *
 * The order of siblings preserves the order in which the names first
 * appear, so users get a stable listing.
 */
export function parseDeckTree(names: string[]): DeckNode[] {
  const roots: DeckNode[] = [];
  // Map from full path "A::B::C" to its node, so we can attach children.
  const byPath = new Map<string, DeckNode>();

  for (const name of names) {
    const parts = name.split("::");
    let parent: DeckNode[] = roots;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      acc = i === 0 ? parts[i]! : `${acc}::${parts[i]}`;
      let node = byPath.get(acc);
      if (!node) {
        node = { name: parts[i]!, fullName: acc, totalCards: 0, ownCards: 0, children: [] };
        byPath.set(acc, node);
        parent.push(node);
      }
      parent = node.children;
    }
  }
  return roots;
}

/** Sum a node's own cards and all descendants'. */
function totalCards(node: DeckNode): number {
  let n = node.ownCards;
  for (const c of node.children) n += totalCards(c);
  return n;
}

function flatten(tree: DeckNode[]): DeckNode[] {
  const out: DeckNode[] = [];
  const walk = (nodes: DeckNode[]) => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}

/**
 * Fetch the full deck report from AnkiConnect.
 *
 * Card counts come from `findCards("\"deck:<name>\"")`. We do this once
 * per deck (not per leaf), then propagate totals up the tree so each
 * node reports `totalCards = own + descendants`.
 */
export async function fetchDeckReport(opts: DeckReportOptions): Promise<DeckReport> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl,
    fetchImpl: opts.fetchImpl,
  });

  const [names, ids] = await Promise.all([
    client.deckNames(),
    client.deckNamesAndIds(),
  ]);

  const tree = parseDeckTree(names);

  // One findCards per deck. AnkiConnect does not expose a batched
  // variant, but this is cheap for normal collections.
  const flat = flatten(tree);
  await Promise.all(
    flat.map(async (node) => {
      const cards = await client.findCards(`"deck:${node.fullName}"`);
      node.ownCards = cards.length;
      const id = ids[node.fullName];
      if (typeof id === "number") node.deckId = id;
    }),
  );

  // Bottom-up totals.
  for (const node of flat) {
    node.totalCards = totalCards(node);
  }

  const flatReport = flat.map((n) => {
    const out: { name: string; totalCards: number; ownCards: number; id?: number } = {
      name: n.fullName,
      totalCards: n.totalCards,
      ownCards: n.ownCards,
    };
    if (typeof n.deckId === "number") out.id = n.deckId;
    return out;
  });

  return { tree, flat: flatReport };
}

/** Render a tree as a human-friendly indented string. */
export function renderDeckTree(tree: DeckNode[]): string {
  const lines: string[] = [];
  const walk = (nodes: DeckNode[], depth: number) => {
    for (const n of nodes) {
      const indent = "  ".repeat(depth);
      const total = n.totalCards;
      const own = n.ownCards;
      const cards = total === own
        ? `${total} card${total === 1 ? "" : "s"}`
        : `${total} cards (${own} direct)`;
      const idSuffix = typeof n.deckId === "number" ? `  [#${n.deckId}]` : "";
      lines.push(`${indent}${n.fullName}  —  ${cards}${idSuffix}`);
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return lines.join("\n");
}
