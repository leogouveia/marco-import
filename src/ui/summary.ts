/** Resumo da comparação no terminal. */
import type { Candidate, Comparison, Situation } from "../compare/types.js";
import { SITUATION_LABELS } from "../compare/types.js";

const KIND_LABELS = { pbis: "PBIs", commits: "Commits", pullRequests: "PRs" } as const;

/** Situações cujas observações aparecem no resumo mesmo sem seleção (avisos importantes). */
const ALERTS = new Set<Situation>(["REMOVIDO", "SEM_MAPEAMENTO", "POSSIVEL_DUPLICADO", "CONFIRMAR_POSSE"]);

export function printSummary(comparison: Comparison, log: (line: string) => void = console.log): void {
  log("");
  log("Resumo da comparação com o Marco");
  for (const kind of Object.keys(KIND_LABELS) as Array<keyof Comparison>) {
    const rows = comparison[kind] as Candidate[];
    const counts = new Map<Situation, number>();
    for (const row of rows) counts.set(row.situation, (counts.get(row.situation) ?? 0) + 1);
    const parts = [...counts.entries()].map(([situation, count]) => `${SITUATION_LABELS[situation]}: ${count}`);
    log(`  ${KIND_LABELS[kind]} (${rows.length}): ${parts.join(" · ") || "nenhum"}`);
  }

  const alerts = [...comparison.pbis, ...comparison.commits, ...comparison.pullRequests].filter(
    (row) => ALERTS.has(row.situation) || row.notes.some((note) => note.includes("confira")),
  );
  if (alerts.length) {
    log("");
    log("Atenção");
    for (const row of alerts) {
      log(`  [${SITUATION_LABELS[row.situation]}] ${row.label}`);
      for (const note of row.notes) log(`      ${note}`);
    }
  }
  log("");
}
