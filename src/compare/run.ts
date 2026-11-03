/** Junta as comparações de PBIs, commits e PRs. */
import type { AzurePbi } from "../azure/types.js";
import { identitySet } from "../azure/identity.js";
import type { ResolvedConfig } from "../config/schema.js";
import { StatusMapper } from "../domain/status.js";
import type { GithubData } from "../github/collect.js";
import type { MarcoPlan, MarcoState } from "../marco/types.js";
import { compareCommits } from "./commits.js";
import { LinkResolver } from "./links.js";
import { MarcoIndex } from "./marco-index.js";
import { comparePbis } from "./pbis.js";
import { comparePullRequests } from "./pull-requests.js";
import type { Comparison } from "./types.js";

export function compareAll(input: {
  config: ResolvedConfig;
  marco: MarcoState;
  plan: MarcoPlan;
  azurePbis: AzurePbi[];
  github: GithubData;
}): Comparison {
  const { config, marco, plan, azurePbis, github } = input;
  const mapper = new StatusMapper(config.azure.status_map, config.azure.removed_states);
  const ownershipStates = new Set(
    (config.azure.ownership_states ?? mapper.statesFor("EM_DESENVOLVIMENTO")).map((state) => state.toLowerCase()),
  );
  const me = identitySet(config.azure.user.email, config.azure.user.aliases);
  const index = new MarcoIndex(marco, config.azure.organization);

  const pbis = comparePbis(azurePbis, { plan, index, mapper, me, ownershipStates });

  // PBIs que podem receber vínculos: os importáveis do Azure e os que já existem no plano.
  const azureWorkItems = new Set(
    pbis.flatMap((row) => (row.item ? [row.item.workItemId] : [])),
  );
  const known = new Set([...azureWorkItems, ...index.workItemIdsInPlan(plan.id)]);
  const links = new LinkResolver(azurePbis, github.pullRequests, known);

  const commits = compareCommits(github.commits, { plan, index, links, azureWorkItems });
  const collectedShas = new Set(commits.filter((row) => row.item?.action === "create").map((row) => row.item!.sha));
  const pullRequests = comparePullRequests(github.pullRequests, { plan, index, links, azureWorkItems, collectedShas });

  return { pbis, commits, pullRequests };
}
