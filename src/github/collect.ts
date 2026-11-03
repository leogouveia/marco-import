/**
 * Coleta de commits e PRs do usuário no GitHub.
 *
 * Commits: listados por repositório, filtrando pelo login e por cada e-mail configurado.
 * PRs: os de autoria do usuário, com estado, datas e commits.
 * Commits do usuário que aparecem dentro dos PRs também entram (deduplicados por SHA), porque
 * um commit de squash ou feito pela interface pode usar um e-mail fora da lista.
 */
import type { ResolvedConfig } from "../config/schema.js";
import { githubRepoBaseUrl } from "../shared/repo-url.js";
import { firstLine, workItemMentions } from "../shared/text.js";
import { toIsoInstant, type CivilRange } from "../shared/time.js";
import type { GithubClient } from "./client.js";
import type { GithubCommit, GithubPullRequest, PullRequestState } from "./types.js";

type RawCommit = {
  sha: string;
  commit: { message: string; author: { email?: string | null; date: string } | null };
  author: { login?: string } | null;
};

type RawSearchIssue = { number: number };

type RawPull = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  created_at: string;
  merged_at: string | null;
};

/** Limite da API: a listagem de commits de um PR devolve no máximo 250. */
const MAX_PR_COMMITS = 250;

export type GithubData = { commits: GithubCommit[]; pullRequests: GithubPullRequest[] };

export async function collectGithub(
  client: GithubClient,
  config: ResolvedConfig["github"],
  range: CivilRange,
  progress: (message: string) => void = () => {},
): Promise<GithubData> {
  const emails = new Set(config.author_emails.map((email) => email.toLowerCase()));
  const login = config.login.toLowerCase();
  const isMine = (raw: RawCommit) =>
    (raw.commit.author?.email && emails.has(raw.commit.author.email.toLowerCase())) ||
    raw.author?.login?.toLowerCase() === login;

  // Margem de um dia em cada ponta: o filtro exato pelo dia em São Paulo é feito depois.
  const since = shiftDay(range.from, -1);
  const until = shiftDay(range.to, 2);

  const commits = new Map<string, GithubCommit>();
  const pullRequests: GithubPullRequest[] = [];

  for (const repo of config.repositories) {
    const baseUrl = githubRepoBaseUrl(config.web_url, repo);

    for (const author of [config.login, ...config.author_emails]) {
      progress(`GitHub: commits de ${author} em ${repo}...`);
      const raws = await client.paginate<RawCommit>(`repos/${repo}/commits`, {
        author,
        since: `${since}T00:00:00Z`,
        until: `${until}T00:00:00Z`,
      });
      for (const raw of raws) commits.set(raw.sha, toCommit(raw, repo, baseUrl));
    }

    progress(`GitHub: PRs de ${config.login} em ${repo}...`);
    const found = await client.paginate<RawSearchIssue>("search/issues", {
      q: `is:pr author:${config.login} repo:${repo} updated:>=${since}`,
    });
    for (const { number } of found) {
      const pull = await client.get<RawPull>(`repos/${repo}/pulls/${number}`);
      const prCommits = await client.paginate<RawCommit>(`repos/${repo}/pulls/${number}/commits`, {}, MAX_PR_COMMITS);
      for (const raw of prCommits) {
        if (isMine(raw) && !commits.has(raw.sha)) commits.set(raw.sha, toCommit(raw, repo, baseUrl));
      }
      pullRequests.push(toPullRequest(pull, repo, baseUrl, prCommits.map((raw) => raw.sha)));
    }
  }

  return { commits: [...commits.values()], pullRequests };
}

function toCommit(raw: RawCommit, repo: string, repoBaseUrl: string): GithubCommit {
  return {
    repo,
    repoBaseUrl,
    sha: raw.sha.toLowerCase(),
    message: firstLine(raw.commit.message) || raw.sha.slice(0, 8),
    authoredAt: toIsoInstant(raw.commit.author?.date ?? new Date(0).toISOString()),
    authorEmail: raw.commit.author?.email?.toLowerCase() ?? null,
    authorLogin: raw.author?.login ?? null,
    workItemIds: workItemMentions(raw.commit.message),
  };
}

export function pullRequestState(pull: Pick<RawPull, "state" | "merged_at">): PullRequestState {
  if (pull.merged_at) return "MERGED";
  return pull.state === "open" ? "ABERTO" : "CANCELADO";
}

function toPullRequest(pull: RawPull, repo: string, repoBaseUrl: string, shas: string[]): GithubPullRequest {
  return {
    repo,
    repoBaseUrl,
    number: String(pull.number),
    title: pull.title,
    state: pullRequestState(pull),
    openedAt: toIsoInstant(pull.created_at),
    mergedAt: pull.merged_at ? toIsoInstant(pull.merged_at) : null,
    commitShas: shas.map((sha) => sha.toLowerCase()),
    workItemIds: workItemMentions(`${pull.title}\n${pull.body ?? ""}`),
  };
}

/** Soma dias a uma data civil `YYYY-MM-DD`. */
function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
