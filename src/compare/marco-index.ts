/**
 * Índices de consulta sobre os dados do Marco, para a comparação não percorrer listas inteiras
 * a cada item.
 */
import { repoKey } from "../shared/repo-url.js";
import type {
  MarcoCommit,
  MarcoPbi,
  MarcoPbiStatus,
  MarcoPullRequest,
  MarcoRepository,
  MarcoState,
} from "../marco/types.js";

/** Número do work item na URL de origem do PBI (`.../_workitems/edit/123`). */
export function workItemIdFromUrl(url: string | null, organization: string): number | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  const org = organization.toLowerCase();
  const sameOrg = lower.includes(`dev.azure.com/${org}/`) || lower.includes(`//${org}.visualstudio.com/`);
  const match = /\/_workitems\/edit\/(\d+)/i.exec(url);
  return sameOrg && match?.[1] ? Number(match[1]) : null;
}

export class MarcoIndex {
  private readonly repoByKey = new Map<string, MarcoRepository>();
  private readonly repoById = new Map<string, MarcoRepository>();
  private readonly pbisByWorkItem = new Map<number, MarcoPbi[]>();
  private readonly historyByPbi = new Map<string, MarcoPbiStatus[]>();
  private readonly prByRepoNumber = new Map<string, MarcoPullRequest>();
  private readonly pbiCommitLinks = new Set<string>();
  private readonly pbiPrLinks = new Set<string>();
  private readonly prCommitLinks = new Set<string>();

  constructor(
    readonly state: MarcoState,
    organization: string,
  ) {
    for (const repo of state.repositories) {
      this.repoByKey.set(repoKey(repo.baseUrl), repo);
      this.repoById.set(repo.id, repo);
    }
    for (const pbi of state.pbis) {
      const id = workItemIdFromUrl(pbi.originUrl, organization);
      if (id !== null) this.pbisByWorkItem.set(id, [...(this.pbisByWorkItem.get(id) ?? []), pbi]);
    }
    for (const row of state.pbiStatusHistory) {
      this.historyByPbi.set(row.pbiId, [...(this.historyByPbi.get(row.pbiId) ?? []), row]);
    }
    for (const pr of state.pullRequests) {
      const repo = pr.repositoryId ? this.repoById.get(pr.repositoryId) : undefined;
      if (repo && pr.externalId) this.prByRepoNumber.set(`${repoKey(repo.baseUrl)}#${pr.externalId.replace(/^#/, "")}`, pr);
    }
    for (const row of state.pbiCommits) this.pbiCommitLinks.add(`${row.pbiId}:${row.commitId}`);
    for (const row of state.pbiPullRequests) this.pbiPrLinks.add(`${row.pbiId}:${row.pullRequestId}`);
    for (const row of state.pullRequestCommits) this.prCommitLinks.add(`${row.pullRequestId}:${row.commitId}`);
  }

  repository(baseUrl: string): MarcoRepository | undefined {
    return this.repoByKey.get(repoKey(baseUrl));
  }

  pbisForWorkItem(workItemId: number): MarcoPbi[] {
    return this.pbisByWorkItem.get(workItemId) ?? [];
  }

  /** Histórico do PBI no Marco, do mais antigo para o mais recente. */
  /** Work items que já têm PBI no plano. */
  workItemIdsInPlan(planId: string): number[] {
    return [...this.pbisByWorkItem.entries()]
      .filter(([, pbis]) => pbis.some((pbi) => pbi.planId === planId))
      .map(([id]) => id);
  }

  history(pbiId: string): MarcoPbiStatus[] {
    return [...(this.historyByPbi.get(pbiId) ?? [])].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  /**
   * Commit do Marco com o mesmo SHA no mesmo repositório. Aceita SHA abreviado cadastrado à mão
   * (7 caracteres ou mais) e registros antigos que guardam só o nome do repositório.
   */
  findCommit(sha: string, baseUrl: string, repoName: string): MarcoCommit | undefined {
    const repo = this.repository(baseUrl);
    const full = sha.toLowerCase();
    return this.state.commits.find((commit) => {
      const stored = commit.sha.trim().toLowerCase();
      const sameSha = stored === full || (stored.length >= 7 && full.startsWith(stored));
      if (!sameSha) return false;
      if (commit.repositoryId) return repo !== undefined && commit.repositoryId === repo.id;
      return commit.repository?.toLowerCase() === repoName.toLowerCase();
    });
  }

  findPullRequest(baseUrl: string, number: string): MarcoPullRequest | undefined {
    return this.prByRepoNumber.get(`${repoKey(baseUrl)}#${number}`);
  }

  hasPbiCommit(pbiId: string, commitId: string): boolean {
    return this.pbiCommitLinks.has(`${pbiId}:${commitId}`);
  }

  hasPbiPullRequest(pbiId: string, prId: string): boolean {
    return this.pbiPrLinks.has(`${pbiId}:${prId}`);
  }

  hasPullRequestCommit(prId: string, commitId: string): boolean {
    return this.prCommitLinks.has(`${prId}:${commitId}`);
  }

  planName(planId: string): string {
    const plan = this.state.plans.find((row) => row.id === planId);
    return plan ? `${plan.employeeName} (${plan.startDate} a ${plan.endDate})` : planId;
  }
}
