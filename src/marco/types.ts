/**
 * Dados do Marco lidos do backup local (só os campos que a importação usa).
 *
 * O backup é o ZIP gerado em Dispositivo → Exportar backup (formato 3), com `manifest.json`,
 * `snapshot.json` e `sync-meta.json`.
 */
import type { MarcoStatus } from "../domain/status.js";
import type { PullRequestState } from "../github/types.js";

export type MarcoPlan = {
  id: string;
  employeeName: string;
  startDate: string;
  /** Fim efetivo gravado pelo Marco (fim-base deslocado pelas pausas). */
  endDate: string;
  closedOn: string | null;
};

export type MarcoRepository = { id: string; name: string; baseUrl: string };

export type MarcoPbi = {
  id: string;
  planId: string;
  title: string;
  originUrl: string | null;
  status: MarcoStatus;
  occurredAt: string;
};

export type MarcoPbiStatus = {
  pbiId: string;
  fromStatus: MarcoStatus | null;
  toStatus: MarcoStatus;
  occurredAt: string;
};

export type MarcoCommit = {
  id: string;
  planId: string;
  sha: string;
  repositoryId: string | null;
  /** Nome do repositório em registros antigos, sem `repositoryId`. */
  repository: string | null;
  occurredAt: string;
};

export type MarcoPullRequest = {
  id: string;
  planId: string;
  title: string;
  url: string;
  repositoryId: string | null;
  externalId: string | null;
  state: PullRequestState;
  openedAt: string;
  mergedAt: string | null;
};

/** Informações do backup, gravadas no arquivo de importação para a tela do Marco conferir. */
export type MarcoBackupInfo = {
  exportedAt: string;
  generation: string | null;
  baseRevision: number;
  /** O dispositivo tinha alterações não sincronizadas quando o backup foi feito. */
  dirty: boolean;
};

export type MarcoState = {
  backup: MarcoBackupInfo;
  plans: MarcoPlan[];
  repositories: MarcoRepository[];
  pbis: MarcoPbi[];
  pbiStatusHistory: MarcoPbiStatus[];
  commits: MarcoCommit[];
  pullRequests: MarcoPullRequest[];
  pbiCommits: Array<{ pbiId: string; commitId: string }>;
  pbiPullRequests: Array<{ pbiId: string; pullRequestId: string }>;
  pullRequestCommits: Array<{ pullRequestId: string; commitId: string }>;
};

/** Período usado para filtrar fatos: do início até o fechamento ou, sem fechamento, o fim efetivo. */
export function planRange(plan: MarcoPlan): { from: string; to: string } {
  return { from: plan.startDate, to: plan.closedOn ?? plan.endDate };
}
