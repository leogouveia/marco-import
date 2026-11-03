/** Dados do GitHub já normalizados para a comparação. */

/** Estados de PR do Marco. */
export type PullRequestState = "ABERTO" | "MERGED" | "CANCELADO";

export type GithubCommit = {
  /** Repositório no formato dono/nome. */
  repo: string;
  /** URL base do repositório, como o Marco guarda. */
  repoBaseUrl: string;
  sha: string;
  /** Primeira linha da mensagem. */
  message: string;
  /** Instante de autoria (quando o commit foi escrito; não muda com rebase). */
  authoredAt: string;
  authorEmail: string | null;
  authorLogin: string | null;
  /** Work items mencionados como AB#123 na mensagem completa. */
  workItemIds: number[];
};

export type GithubPullRequest = {
  repo: string;
  repoBaseUrl: string;
  /** Número do PR (o "ID externo" no Marco). */
  number: string;
  title: string;
  state: PullRequestState;
  openedAt: string;
  mergedAt: string | null;
  /** SHAs de todos os commits do PR. */
  commitShas: string[];
  /** Work items mencionados como AB#123 no título ou na descrição. */
  workItemIds: number[];
};
