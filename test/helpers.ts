/** Dados fictícios para os testes. Nenhum dado real de empresa. */
import type { AzurePbi, AzureRevision } from "../src/azure/types.js";
import { ConfigSchema, type ResolvedConfig } from "../src/config/schema.js";
import type { MarcoState } from "../src/marco/types.js";

export const ORG = "exemplo-org";
export const PROJECT = "ProjetoExemplo";
export const ME = "dev@exemplo.com";
export const OTHER = "outra.pessoa@exemplo.com";
export const PLAN_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_PLAN_ID = "22222222-2222-4222-8222-222222222222";
export const REPO_ID = "33333333-3333-4333-8333-333333333333";
export const REPO_URL = "https://github.com/exemplo/app";

export function testConfig(overrides: Record<string, unknown> = {}): ResolvedConfig {
  const parsed = ConfigSchema.parse({
    azure: {
      organization: ORG,
      base_url: `https://dev.azure.com/${ORG}`,
      projects: [{ name: PROJECT }],
      user: { email: ME },
      status_map: {
        ATRIBUIDO: ["New", "Pronto para Desenvolver"],
        EM_DESENVOLVIMENTO: ["Em Desenvolvimento", "Em Code Review"],
        ENTREGUE: ["Aguardando Homologação", "Done"],
      },
      removed_states: ["Removed"],
    },
    github: { login: "dev-exemplo", author_emails: [ME, "dev@pessoal.exemplo"], repositories: ["exemplo/app"] },
    ...overrides,
  });
  return { ...parsed, azure: { ...parsed.azure, token: "x" }, github: { ...parsed.github, token: "x" } };
}

let rev = 0;
export function revision(state: string, assignedTo: string | null, changedDate: string): AzureRevision {
  rev += 1;
  return { rev, state, assignedTo, changedDate };
}

export function azurePbi(id: number, revisions: AzureRevision[], extra: Partial<AzurePbi> = {}): AzurePbi {
  const last = revisions.at(-1)!;
  return {
    workItemId: id,
    project: PROJECT,
    url: `https://dev.azure.com/${ORG}/${PROJECT}/_workitems/edit/${id}`,
    title: `PBI ${id}`,
    state: last.state,
    assignedTo: last.assignedTo,
    revisions,
    links: { commitShas: [], pullRequests: [], unknown: [] },
    ...extra,
  };
}

export function marcoState(overrides: Partial<MarcoState> = {}): MarcoState {
  return {
    backup: { exportedAt: "2026-11-20T12:00:00.000Z", generation: "gen-1", baseRevision: 7, dirty: false },
    plans: [
      { id: PLAN_ID, employeeName: "Pessoa", startDate: "2026-11-03", endDate: "2026-11-24", closedOn: null },
      { id: OTHER_PLAN_ID, employeeName: "Pessoa", startDate: "2026-09-01", endDate: "2026-09-30", closedOn: null },
    ],
    repositories: [{ id: REPO_ID, name: "app", baseUrl: REPO_URL }],
    pbis: [],
    pbiStatusHistory: [],
    commits: [],
    pullRequests: [],
    pbiCommits: [],
    pbiPullRequests: [],
    pullRequestCommits: [],
    ...overrides,
  };
}

export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
