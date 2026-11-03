/**
 * Coleta dos PBIs do usuário no Azure Boards.
 *
 * Busca os work items dos tipos configurados que estão ou já estiveram atribuídos ao usuário e
 * que mudaram desde o início do plano. Para cada um, lê as revisões (para reconstruir quando
 * cada estado começou e com quem o item estava) e os vínculos com commits e PRs.
 */
import type { ResolvedConfig } from "../config/schema.js";
import { toIsoInstant, type CivilRange } from "../shared/time.js";
import type { AzureClient, RawRevision, RawWorkItem } from "./client.js";
import { identitySet, readIdentity } from "./identity.js";
import { readLinks } from "./links.js";
import type { AzurePbi, AzureRevision } from "./types.js";

/** Escapa um valor para uso entre aspas simples na WIQL. */
function wiqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Consulta WIQL. O operador `EVER` ("já foi") encontra itens que foram do usuário em alguma
 * revisão, mesmo que hoje estejam com outra pessoa; a regra de posse decide depois.
 */
export function buildWiql(config: ResolvedConfig["azure"], project: string, range: CivilRange): string {
  const people = [config.user.email, ...config.user.aliases].map(wiqlString);
  const assigned = people
    .map((person) => `[System.AssignedTo] = ${person} OR [System.AssignedTo] EVER ${person}`)
    .join(" OR ");
  const types = config.work_item_types.map(wiqlString).join(", ");
  return [
    "SELECT [System.Id] FROM WorkItems",
    `WHERE [System.TeamProject] = ${wiqlString(project)}`,
    `AND [System.WorkItemType] IN (${types})`,
    `AND (${assigned})`,
    `AND [System.ChangedDate] >= ${wiqlString(range.from)}`,
    "ORDER BY [System.Id]",
  ].join(" ");
}

export async function collectAzurePbis(
  client: AzureClient,
  config: ResolvedConfig["azure"],
  range: CivilRange,
  progress: (message: string) => void = () => {},
): Promise<AzurePbi[]> {
  const me = identitySet(config.user.email, config.user.aliases);
  const result: AzurePbi[] = [];

  for (const project of config.projects) {
    progress(`Azure: consultando PBIs em ${project.name}...`);
    const ids = await client.queryIds(project.name, buildWiql(config, project.name, range));
    const items = await client.getWorkItems(ids);
    let done = 0;
    for (const item of items) {
      done += 1;
      progress(`Azure: histórico ${done}/${items.length} (#${item.id})`);
      const revisions = await client.getRevisions(item.id);
      result.push(toAzurePbi(item, revisions, project.name, config.base_url));
    }
  }
  // Mantém só itens em que o usuário aparece em alguma revisão (a WIQL já filtra; é uma garantia).
  return result.filter((pbi) => pbi.revisions.some((rev) => rev.assignedTo && me.has(rev.assignedTo)));
}

export function toAzurePbi(item: RawWorkItem, rawRevisions: RawRevision[], project: string, baseUrl: string): AzurePbi {
  const revisions: AzureRevision[] = rawRevisions
    .map((rev) => ({
      rev: rev.rev,
      state: String(rev.fields["System.State"] ?? ""),
      assignedTo: readIdentity(rev.fields["System.AssignedTo"]),
      changedDate: toIsoInstant(String(rev.fields["System.ChangedDate"])),
    }))
    .sort((a, b) => a.rev - b.rev);

  return {
    workItemId: item.id,
    project,
    url: `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(project)}/_workitems/edit/${item.id}`,
    title: String(item.fields["System.Title"] ?? `Work item ${item.id}`),
    state: String(item.fields["System.State"] ?? ""),
    assignedTo: readIdentity(item.fields["System.AssignedTo"]),
    revisions,
    links: readLinks(item.relations),
  };
}
