/** Resultado da comparação: cada item coletado com a sua situação em relação ao Marco. */
import type { ImportCommit, ImportPbi, ImportPullRequest } from "../output/format.js";

export type Situation =
  | "NOVO"
  | "STATUS_MUDOU"
  | "VINCULO_NOVO"
  | "POSSIVEL_DUPLICADO"
  | "CONFIRMAR_POSSE"
  | "FORA_DO_PERIODO"
  | "JA_EXISTE"
  | "OUTRO_PLANO"
  | "REMOVIDO"
  | "SEM_MAPEAMENTO";

export const SITUATION_LABELS: Record<Situation, string> = {
  NOVO: "Novo",
  STATUS_MUDOU: "Status mudou",
  VINCULO_NOVO: "Vínculo novo",
  POSSIVEL_DUPLICADO: "Possível duplicado",
  CONFIRMAR_POSSE: "Confirmar (mudou de responsável)",
  FORA_DO_PERIODO: "Fora do período do plano",
  JA_EXISTE: "Já existe (igual)",
  OUTRO_PLANO: "Já existe em outro plano",
  REMOVIDO: "Removido do Azure",
  SEM_MAPEAMENTO: "Estado sem mapeamento",
};

type Base = {
  /** Identificador estável do item na lista (tipo + chave externa). */
  key: string;
  label: string;
  detail: string;
  situation: Situation;
  /** Observações para o usuário (motivo do bloqueio, avisos). */
  notes: string[];
  /** Pode ser marcado para importação. */
  selectable: boolean;
  /** Já vem marcado na seleção. */
  preselected: boolean;
};

export type PbiCandidate = Base & { kind: "pbi"; item: ImportPbi | null };
export type CommitCandidate = Base & { kind: "commit"; item: ImportCommit | null };
export type PullRequestCandidate = Base & { kind: "pullRequest"; item: ImportPullRequest | null };

export type Candidate = PbiCandidate | CommitCandidate | PullRequestCandidate;

export type Comparison = {
  pbis: PbiCandidate[];
  commits: CommitCandidate[];
  pullRequests: PullRequestCandidate[];
};

/** Situações em que o item não pode ser importado. */
const BLOCKED = new Set<Situation>(["JA_EXISTE", "OUTRO_PLANO", "REMOVIDO", "SEM_MAPEAMENTO"]);
/** Situações importáveis que exigem decisão consciente (não vêm marcadas). */
const NEEDS_DECISION = new Set<Situation>(["POSSIVEL_DUPLICADO", "CONFIRMAR_POSSE", "FORA_DO_PERIODO"]);

export function selection(situation: Situation): { selectable: boolean; preselected: boolean } {
  if (BLOCKED.has(situation)) return { selectable: false, preselected: false };
  return { selectable: true, preselected: !NEEDS_DECISION.has(situation) };
}
