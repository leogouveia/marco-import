/**
 * Comparação dos PRs do GitHub com o Marco.
 *
 * Um PR é o mesmo quando tem o mesmo número no mesmo repositório. Se o estado mudou (por
 * exemplo, de aberto para merged), o item vira uma atualização.
 */
import type { GithubPullRequest } from "../github/types.js";
import type { MarcoPlan } from "../marco/types.js";
import { planRange } from "../marco/types.js";
import { truncate } from "../shared/text.js";
import { formatInstant, isWithin } from "../shared/time.js";
import type { LinkResolver } from "./links.js";
import type { MarcoIndex } from "./marco-index.js";
import { selection, type PullRequestCandidate, type Situation } from "./types.js";

const STATE_LABELS = { ABERTO: "Aberto", MERGED: "Merged", CANCELADO: "Cancelado" } as const;

export type PullRequestContext = {
  plan: MarcoPlan;
  index: MarcoIndex;
  links: LinkResolver;
  azureWorkItems: Set<number>;
  /** SHAs dos commits coletados (podem ser criados pela importação). */
  collectedShas: Set<string>;
};

export function comparePullRequests(prs: GithubPullRequest[], ctx: PullRequestContext): PullRequestCandidate[] {
  return prs
    .map((pr) => comparePullRequest(pr, ctx))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
}

function comparePullRequest(pr: GithubPullRequest, ctx: PullRequestContext): PullRequestCandidate {
  const repository = { name: pr.repo, baseUrl: ctx.index.repository(pr.repoBaseUrl)?.baseUrl ?? pr.repoBaseUrl };
  const pbiWorkItemIds = ctx.links.forPullRequest(pr.number, pr.workItemIds);
  const notes: string[] = [];
  if (pbiWorkItemIds.length) notes.push(`PBIs: ${pbiWorkItemIds.map((id) => `#${id}`).join(", ")}`);

  const base = {
    kind: "pullRequest" as const,
    key: `pr:${pr.repo}#${pr.number}`,
    label: `${pr.repo}#${pr.number} ${truncate(pr.title, 60)}`,
    detail: `${STATE_LABELS[pr.state]} · aberto em ${formatInstant(pr.openedAt)}${pr.mergedAt ? ` · merge em ${formatInstant(pr.mergedAt)}` : ""}`,
  };
  const result = (situation: Situation, item: PullRequestCandidate["item"], extra: string[] = []): PullRequestCandidate => ({
    ...base,
    situation,
    item,
    notes: [...extra, ...notes],
    ...selection(situation),
  });

  const existing = ctx.index.findPullRequest(pr.repoBaseUrl, pr.number);
  if (existing && existing.planId !== ctx.plan.id) {
    return result("OUTRO_PLANO", null, [`Existe em: ${ctx.index.planName(existing.planId)}`]);
  }

  if (existing) {
    const missingPbis = pbiWorkItemIds.filter((id) => {
      const pbi = ctx.index.pbisForWorkItem(id).find((row) => row.planId === ctx.plan.id);
      return pbi ? !ctx.index.hasPbiPullRequest(pbi.id, existing.id) : ctx.azureWorkItems.has(id);
    });
    const missingCommits = pr.commitShas.filter((sha) => {
      const commit = ctx.index.findCommit(sha, pr.repoBaseUrl, pr.repo);
      return commit ? !ctx.index.hasPullRequestCommit(existing.id, commit.id) : ctx.collectedShas.has(sha);
    });
    const stateChanged = existing.state !== pr.state || (existing.mergedAt === null) !== (pr.mergedAt === null);
    if (!stateChanged && !missingPbis.length && !missingCommits.length) return result("JA_EXISTE", null);

    const extra: string[] = [];
    if (stateChanged) extra.push(`Marco: ${STATE_LABELS[existing.state]} → ${STATE_LABELS[pr.state]}`);
    if (missingCommits.length) extra.push(`Vincular ${missingCommits.length} commit(s)`);
    if (missingPbis.length) extra.push(`Vincular aos PBIs ${missingPbis.map((id) => `#${id}`).join(", ")}`);
    return result(
      stateChanged ? "STATUS_MUDOU" : "VINCULO_NOVO",
      {
        action: "update",
        marcoPullRequestId: existing.id,
        repository,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        mergedAt: pr.mergedAt,
        commitShas: missingCommits,
        pbiWorkItemIds: missingPbis,
      },
      extra,
    );
  }

  const item = {
    action: "create" as const,
    repository,
    number: pr.number,
    title: pr.title,
    state: pr.state,
    openedAt: pr.openedAt,
    mergedAt: pr.mergedAt,
    commitShas: pr.commitShas,
    pbiWorkItemIds,
  };
  if (!isWithin(pr.openedAt, planRange(ctx.plan))) {
    return result("FORA_DO_PERIODO", item, ["Aberto fora do período do plano."]);
  }
  return result("NOVO", item);
}
