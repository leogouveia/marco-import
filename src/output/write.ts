/** Montagem e gravação do arquivo de importação. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { MarcoPlan, MarcoState } from "../marco/types.js";
import type { Selection } from "../ui/select.js";
import {
  IMPORT_FILE_KIND,
  IMPORT_FORMAT_VERSION,
  type ImportFile,
  type RepositoryRef,
} from "./format.js";
import { repoKey } from "../shared/repo-url.js";

export function buildImportFile(input: {
  selection: Selection;
  plan: MarcoPlan;
  marco: MarcoState;
  generator: { name: string; version: string };
  now?: Date;
}): ImportFile {
  const { selection, plan, marco } = input;
  const pbis = selection.pbis.flatMap((row) => (row.item ? [row.item] : []));
  const commits = selection.commits.flatMap((row) => (row.item ? [row.item] : []));
  const pullRequests = selection.pullRequests.flatMap((row) => (row.item ? [row.item] : []));

  const repositories = new Map<string, RepositoryRef>();
  for (const item of [...commits, ...pullRequests]) repositories.set(repoKey(item.repository.baseUrl), item.repository);

  return {
    kind: IMPORT_FILE_KIND,
    formatVersion: IMPORT_FORMAT_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    generator: input.generator,
    basedOn: marco.backup,
    plan: {
      id: plan.id,
      employeeName: plan.employeeName,
      startDate: plan.startDate,
      endDate: plan.endDate,
      closedOn: plan.closedOn,
    },
    repositories: [...repositories.values()],
    pbis,
    commits,
    pullRequests,
  };
}

/**
 * Vínculos que apontam para PBIs que não existem no plano nem foram selecionados: o Marco vai
 * ignorá-los. Devolve os números dos work items, para aviso.
 */
export function danglingWorkItems(file: ImportFile, existingInPlan: Set<number>): number[] {
  const selected = new Set(file.pbis.map((pbi) => pbi.workItemId));
  const referenced = [...file.commits, ...file.pullRequests].flatMap((item) => item.pbiWorkItemIds);
  return [...new Set(referenced)].filter((id) => !selected.has(id) && !existingInPlan.has(id)).sort((a, b) => a - b);
}

export function writeImportFile(file: ImportFile, directory: string): string {
  mkdirSync(directory, { recursive: true });
  const stamp = file.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
  const path = resolve(join(directory, `marco-import-${stamp}.json`));
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  return path;
}
