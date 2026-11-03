/** Dados do Azure Boards já normalizados para a comparação. */

/** Uma revisão do work item: o estado e o responsável naquele momento. */
export type AzureRevision = {
  rev: number;
  state: string;
  /** Responsável (uniqueName, em minúsculas) ou `null` quando não atribuído. */
  assignedTo: string | null;
  /** Instante ISO da revisão (System.ChangedDate). */
  changedDate: string;
};

/** Vínculos do work item com commits e PRs, lidos das relações do tipo ArtifactLink. */
export type AzureLinks = {
  commitShas: string[];
  pullRequests: Array<{ repoRef: string; number: string }>;
  /** URLs de artefato que não foram reconhecidas; aparecem no relatório para conferência. */
  unknown: string[];
};

export type AzurePbi = {
  workItemId: number;
  project: string;
  /** Link do work item no Azure; é a URL de origem gravada no PBI do Marco. */
  url: string;
  title: string;
  /** Estado atual. */
  state: string;
  /** Responsável atual (uniqueName em minúsculas) ou `null`. */
  assignedTo: string | null;
  /** Revisões em ordem crescente. */
  revisions: AzureRevision[];
  links: AzureLinks;
};
