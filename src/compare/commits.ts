/**
 * Comparação dos commits do GitHub com o Marco.
 *
 * Um commit é o mesmo quando tem o mesmo SHA no mesmo repositório. Commits fora do período do
 * plano escolhido não são importados (regra definida pelo usuário).
 */
import type { GithubCommit } from "../github/types.js";
import type { MarcoPlan } from "../marco/types.js";
import { planRange } from "../marco/types.js";
import { truncate } from "../shared/text.js";
import { formatInstant, isWithin } from "../shared/time.js";
import type { LinkResolver } from "./links.js";
import type { MarcoIndex } from "./marco-index.js";
import { selection, type CommitCandidate, type Situation } from "./types.js";

export type CommitContext = {
  plan: MarcoPlan;
  index: MarcoIndex;
  links: LinkResolver;
  /** Work items coletados do Azure (podem ser criados pela importação). */
  azureWorkItems: Set<number>;
};

export function compareCommits(commits: GithubCommit[], ctx: CommitContext): CommitCandidate[] {
  return commits
    .map((commit) => compareCommit(commit, ctx))
    .sort((a, b) => a.detail.localeCompare(b.detail));
}

function compareCommit(commit: GithubCommit, ctx: CommitContext): CommitCandidate {
  const repository = { name: commit.repo, baseUrl: ctx.index.repository(commit.repoBaseUrl)?.baseUrl ?? commit.repoBaseUrl };
  const pbiWorkItemIds = ctx.links.forCommit(commit.sha, commit.workItemIds);
  const notes: string[] = [];
  if (!ctx.index.repository(commit.repoBaseUrl)) notes.push(`O repositório ${commit.repo} será cadastrado no Marco.`);
  if (pbiWorkItemIds.length) notes.push(`PBIs: ${pbiWorkItemIds.map((id) => `#${id}`).join(", ")}`);

  const base = {
    kind: "commit" as const,
    key: `commit:${commit.repo}:${commit.sha}`,
    label: `${commit.sha.slice(0, 8)} ${truncate(commit.message, 70)}`,
    detail: `${commit.repo} · ${formatInstant(commit.authoredAt)} · ${commit.authorEmail ?? commit.authorLogin ?? "?"}`,
  };
  const result = (situation: Situation, item: CommitCandidate["item"], extra: string[] = []): CommitCandidate => ({
    ...base,
    situation,
    item,
    notes: [...extra, ...notes],
    ...selection(situation),
  });

  const existing = ctx.index.findCommit(commit.sha, commit.repoBaseUrl, commit.repo);
  if (existing && existing.planId !== ctx.plan.id) {
    return result("OUTRO_PLANO", null, [`Existe em: ${ctx.index.planName(existing.planId)}`]);
  }
  if (existing) {
    const missing = pbiWorkItemIds.filter((id) => {
      const pbi = ctx.index.pbisForWorkItem(id).find((row) => row.planId === ctx.plan.id);
      return pbi ? !ctx.index.hasPbiCommit(pbi.id, existing.id) : ctx.azureWorkItems.has(id);
    });
    if (!missing.length) return result("JA_EXISTE", null);
    return result(
      "VINCULO_NOVO",
      { action: "link", marcoCommitId: existing.id, repository, sha: commit.sha, pbiWorkItemIds: missing },
      [`Vincular aos PBIs ${missing.map((id) => `#${id}`).join(", ")}`],
    );
  }
  if (!isWithin(commit.authoredAt, planRange(ctx.plan))) {
    // Commits fora do período do plano não são importados.
    return { ...result("FORA_DO_PERIODO", null), selectable: false, preselected: false };
  }
  return result("NOVO", {
    action: "create",
    repository,
    sha: commit.sha,
    message: commit.message,
    occurredAt: commit.authoredAt,
    pbiWorkItemIds,
  });
}
