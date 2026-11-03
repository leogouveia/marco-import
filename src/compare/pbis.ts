/**
 * Comparação dos PBIs do Azure com os PBIs do Marco.
 *
 * Um PBI do Marco corresponde a um work item quando a URL de origem aponta para ele. Sem URL,
 * só o título permite suspeitar de duplicidade, e a decisão fica com o usuário.
 */
import type { AzurePbi } from "../azure/types.js";
import { buildHistory, type History, type StatusPoint } from "../domain/history.js";
import { decideOwnership } from "../domain/ownership.js";
import { MARCO_STATUS_LABELS, type StatusMapper } from "../domain/status.js";
import type { MarcoPbi, MarcoPlan } from "../marco/types.js";
import { planRange } from "../marco/types.js";
import type { StatusEntry } from "../output/format.js";
import { normalizeTitle } from "../shared/text.js";
import { businessDay, formatInstant } from "../shared/time.js";
import type { MarcoIndex } from "./marco-index.js";
import { selection, type PbiCandidate, type Situation } from "./types.js";

export type PbiContext = {
  plan: MarcoPlan;
  index: MarcoIndex;
  mapper: StatusMapper;
  me: Set<string>;
  ownershipStates: Set<string>;
};

export function comparePbis(pbis: AzurePbi[], ctx: PbiContext): PbiCandidate[] {
  const candidates: PbiCandidate[] = [];
  for (const pbi of pbis) {
    const candidate = comparePbi(pbi, ctx);
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
}

function comparePbi(pbi: AzurePbi, ctx: PbiContext): PbiCandidate | null {
  const ownership = decideOwnership(pbi, ctx.me, ctx.ownershipStates);
  if (ownership.kind === "not-mine") return null;

  const history = buildHistory(pbi.revisions, ctx.mapper, ctx.me);
  const notes = historyNotes(history);
  const existing = ctx.index.pbisForWorkItem(pbi.workItemId);
  const inPlan = existing.find((row) => row.planId === ctx.plan.id);
  const current = history.points.at(-1);
  const base = {
    kind: "pbi" as const,
    key: `pbi:${pbi.workItemId}`,
    label: `#${pbi.workItemId} ${pbi.title}`,
    detail: `Azure: ${pbi.state}${current ? ` → Marco: ${MARCO_STATUS_LABELS[current.status]}` : ""}`,
  };
  const result = (situation: Situation, item: PbiCandidate["item"], extra: string[] = []): PbiCandidate => ({
    ...base,
    situation,
    item,
    notes: [...extra, ...notes],
    ...selection(situation),
  });

  if (history.removed) {
    const where = existing.map((row) => ctx.index.planName(row.planId));
    return result("REMOVIDO", null, [
      where.length ? `Removido do board, mas existe no Marco em: ${where.join("; ")}. Confira.` : "Removido do board.",
    ]);
  }
  if (!current) {
    return result("SEM_MAPEAMENTO", null, ["Nenhum estado do histórico tem mapeamento na configuração."]);
  }
  if (!inPlan && existing.length) {
    return result("OUTRO_PLANO", null, [`Existe em: ${existing.map((row) => ctx.index.planName(row.planId)).join("; ")}`]);
  }

  if (inPlan) {
    if (inPlan.status === current.status) return result("JA_EXISTE", null);
    const { transitions, warning } = pendingTransitions(inPlan, ctx.index.history(inPlan.id), history.points);
    return result(
      "STATUS_MUDOU",
      {
        action: "update-status",
        marcoPbiId: inPlan.id,
        workItemId: pbi.workItemId,
        originUrl: pbi.url,
        title: pbi.title,
        transitions,
      },
      [`Marco: ${MARCO_STATUS_LABELS[inPlan.status]} → ${MARCO_STATUS_LABELS[current.status]}`, ...(warning ? [warning] : [])],
    );
  }

  const item = {
    action: "create" as const,
    workItemId: pbi.workItemId,
    originUrl: pbi.url,
    title: pbi.title,
    history: history.points.map(toEntry),
  };
  const extra: string[] = [];
  let situation: Situation = "NOVO";

  const duplicate = possibleDuplicate(pbi, ctx);
  if (duplicate) {
    situation = "POSSIVEL_DUPLICADO";
    extra.push(`Já existe no plano um PBI sem link do Azure com o mesmo título: "${duplicate.title}"`);
  }
  if (ownership.kind === "confirm") {
    if (situation === "NOVO") situation = "CONFIRMAR_POSSE";
    extra.push(`Foi seu antes do desenvolvimento; hoje está com ${ownership.lastAssignee ?? "ninguém"}.`);
  }
  if (outsidePlan(history.points, ctx.plan)) {
    if (situation === "NOVO") situation = "FORA_DO_PERIODO";
    extra.push("O histórico fica fora do período do plano.");
  }
  return result(situation, item, extra);
}

function toEntry(point: StatusPoint): StatusEntry {
  return { status: point.status, occurredAt: point.occurredAt };
}

/**
 * Mudanças do Azure ainda não registradas no Marco: as posteriores ao último registro do
 * histórico do PBI. Se não houver (datas divergentes), registra só o status atual, com aviso.
 */
export function pendingTransitions(
  pbi: MarcoPbi,
  marcoHistory: Array<{ occurredAt: string }>,
  points: StatusPoint[],
): { transitions: StatusEntry[]; warning: string | null } {
  const lastRecorded = marcoHistory.at(-1)?.occurredAt ?? pbi.occurredAt;
  const later = points.filter((point) => point.occurredAt > lastRecorded);
  const transitions: StatusEntry[] = [];
  let previous = pbi.status;
  for (const point of later) {
    if (point.status === previous) continue;
    transitions.push(toEntry(point));
    previous = point.status;
  }
  const final = points.at(-1)!;
  if (transitions.at(-1)?.status === final.status) return { transitions, warning: null };
  return {
    transitions: [...transitions, toEntry(final)],
    warning: `A mudança no Azure (${formatInstant(final.occurredAt)}) é anterior ao último registro no Marco (${formatInstant(lastRecorded)}).`,
  };
}

function possibleDuplicate(pbi: AzurePbi, ctx: PbiContext): MarcoPbi | undefined {
  const title = normalizeTitle(pbi.title);
  return ctx.index.state.pbis.find(
    (row) => row.planId === ctx.plan.id && !row.originUrl?.includes("_workitems") && normalizeTitle(row.title) === title,
  );
}

/** Todo o histórico antes do início do plano, ou começando depois do fim. */
function outsidePlan(points: StatusPoint[], plan: MarcoPlan): boolean {
  const range = planRange(plan);
  const first = businessDay(points[0]!.occurredAt);
  const last = businessDay(points.at(-1)!.occurredAt);
  return first > range.to || last < range.from;
}

function historyNotes(history: History): string[] {
  const notes: string[] = [];
  if (history.unmappedStates.length) {
    notes.push(`Estados sem mapeamento ignorados: ${history.unmappedStates.join(", ")}`);
  }
  for (const regression of history.regressions) {
    notes.push(
      `O histórico volta de ${MARCO_STATUS_LABELS[regression.from]} para ${MARCO_STATUS_LABELS[regression.to]} em ${formatInstant(regression.occurredAt)}; confira o mapeamento de estados.`,
    );
  }
  return notes;
}
