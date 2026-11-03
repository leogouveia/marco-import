/**
 * Vínculos entre PBIs, commits e PRs, reunidos das duas fontes:
 * - as relações do work item no Azure (ArtifactLink);
 * - menções `AB#123` em mensagens de commit, títulos e descrições de PR.
 *
 * Só entram PBIs conhecidos: os coletados do Azure ou os que já existem no plano do Marco.
 */
import type { AzurePbi } from "../azure/types.js";
import type { GithubPullRequest } from "../github/types.js";

export class LinkResolver {
  private readonly bySha = new Map<string, Set<number>>();
  private readonly byPrNumber = new Map<string, Set<number>>();

  constructor(
    azurePbis: AzurePbi[],
    pullRequests: GithubPullRequest[],
    private readonly known: Set<number>,
  ) {
    for (const pbi of azurePbis) {
      for (const sha of pbi.links.commitShas) add(this.bySha, sha, pbi.workItemId);
      for (const pr of pbi.links.pullRequests) add(this.byPrNumber, pr.number, pbi.workItemId);
    }
    // O link de PR no Azure traz só o número; ignora números repetidos entre repositórios.
    const counts = new Map<string, number>();
    for (const pr of pullRequests) counts.set(pr.number, (counts.get(pr.number) ?? 0) + 1);
    for (const [number, count] of counts) if (count > 1) this.byPrNumber.delete(number);
  }

  /** PBIs ligados a um commit (o SHA do Azure pode ser abreviado). */
  forCommit(sha: string, mentioned: number[]): number[] {
    const ids = new Set(mentioned);
    for (const [linkedSha, workItems] of this.bySha) {
      if (sha.startsWith(linkedSha)) for (const id of workItems) ids.add(id);
    }
    return this.onlyKnown(ids);
  }

  forPullRequest(number: string, mentioned: number[]): number[] {
    const ids = new Set(mentioned);
    for (const id of this.byPrNumber.get(number) ?? []) ids.add(id);
    return this.onlyKnown(ids);
  }

  private onlyKnown(ids: Set<number>): number[] {
    return [...ids].filter((id) => this.known.has(id)).sort((a, b) => a - b);
  }
}

function add<K>(map: Map<K, Set<number>>, key: K, value: number) {
  const set = map.get(key) ?? new Set<number>();
  set.add(value);
  map.set(key, set);
}
