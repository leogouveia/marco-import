/**
 * Seleção do que importar.
 *
 * Uma lista por tipo (PBIs, commits, PRs). Itens bloqueados aparecem desabilitados com o motivo;
 * itens que pedem decisão (possível duplicado, mudou de responsável, fora do período) aparecem
 * desmarcados. Ao destacar um item, as observações dele aparecem embaixo da lista.
 */
import { checkbox } from "@inquirer/prompts";
import type { Candidate, Comparison } from "../compare/types.js";
import { SITUATION_LABELS } from "../compare/types.js";

const TITLES = { pbis: "PBIs", commits: "Commits", pullRequests: "Pull requests" } as const;

export type Selection = { [K in keyof Comparison]: Comparison[K] };

/** Seleção padrão (sem perguntas): os itens que já vêm marcados. */
export function defaultSelection(comparison: Comparison): Selection {
  return {
    pbis: comparison.pbis.filter((row) => row.preselected),
    commits: comparison.commits.filter((row) => row.preselected),
    pullRequests: comparison.pullRequests.filter((row) => row.preselected),
  };
}

export async function askSelection(comparison: Comparison): Promise<Selection> {
  return {
    pbis: await askKind("pbis", comparison.pbis),
    commits: await askKind("commits", comparison.commits),
    pullRequests: await askKind("pullRequests", comparison.pullRequests),
  };
}

async function askKind<T extends Candidate>(kind: keyof Comparison, rows: T[]): Promise<T[]> {
  if (!rows.some((row) => row.selectable)) {
    if (rows.length) console.log(`${TITLES[kind]}: nada a importar (${rows.length} já existentes ou bloqueados).`);
    return [];
  }
  return checkbox<T>({
    message: `${TITLES[kind]} a importar (espaço marca, a marca todos, enter confirma)`,
    pageSize: 15,
    loop: false,
    choices: rows.map((row) => ({
      value: row,
      name: `[${SITUATION_LABELS[row.situation]}] ${row.label}`,
      checked: row.preselected,
      disabled: row.selectable ? false : SITUATION_LABELS[row.situation],
      description: [row.detail, ...row.notes].join("\n"),
    })),
  });
}
