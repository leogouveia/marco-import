/**
 * Vínculos de um work item com commits e PRs.
 *
 * O Azure Boards guarda esses vínculos como relações `ArtifactLink`, com URLs `vstfs:///...`.
 * Formatos reconhecidos (confira com uma coleta real usando --dump):
 *
 * - commit do GitHub:   vstfs:///GitHub/Commit/<id-repo>%2F<sha>
 * - PR do GitHub:       vstfs:///GitHub/PullRequest/<id-repo>%2F<número>
 * - commit Azure Repos: vstfs:///Git/Commit/<id-projeto>%2F<id-repo>%2F<sha>
 *
 * O `<id-repo>` é um identificador interno da conexão com o GitHub, não o nome `dono/repo`; por
 * isso o PR é casado pelo número e só quando o número é único entre os PRs coletados.
 */
import type { AzureLinks } from "./types.js";

type Relation = { rel?: string; url?: string };

export function readLinks(relations: Relation[] | undefined): AzureLinks {
  const links: AzureLinks = { commitShas: [], pullRequests: [], unknown: [] };
  for (const relation of relations ?? []) {
    if (relation.rel !== "ArtifactLink" || !relation.url) continue;
    const url = safeDecode(relation.url);

    const githubCommit = /^vstfs:\/\/\/GitHub\/Commit\/[^/]+\/([0-9a-f]{7,40})$/i.exec(url);
    const gitCommit = /^vstfs:\/\/\/Git\/Commit\/.+\/([0-9a-f]{40})$/i.exec(url);
    const githubPr = /^vstfs:\/\/\/GitHub\/PullRequest\/([^/]+)\/(\d+)$/i.exec(url);

    if (githubCommit?.[1] || gitCommit?.[1]) {
      links.commitShas.push((githubCommit?.[1] ?? gitCommit?.[1])!.toLowerCase());
    } else if (githubPr?.[1] && githubPr[2]) {
      links.pullRequests.push({ repoRef: githubPr[1], number: githubPr[2] });
    } else if (/^vstfs:\/\/\/(GitHub|Git)\//i.test(url)) {
      // Outros artefatos de código (branch, build...) não interessam ao Marco, mas ficam
      // registrados para conferência quando o formato não é reconhecido.
      if (!/\/(Ref|Branch|Build)\//i.test(url)) links.unknown.push(url);
    }
  }
  return links;
}

function safeDecode(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}
