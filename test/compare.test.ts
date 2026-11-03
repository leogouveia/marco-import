import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareAll } from "../src/compare/run.js";
import { pendingTransitions } from "../src/compare/pbis.js";
import type { Candidate, Comparison } from "../src/compare/types.js";
import type { GithubCommit, GithubPullRequest } from "../src/github/types.js";
import { buildImportFile, danglingWorkItems } from "../src/output/write.js";
import { defaultSelection } from "../src/ui/select.js";
import {
  azurePbi,
  marcoState,
  ME,
  ORG,
  OTHER,
  OTHER_PLAN_ID,
  PLAN_ID,
  PROJECT,
  REPO_ID,
  REPO_URL,
  revision,
  testConfig,
  uuid,
} from "./helpers.js";

const config = testConfig();
const wiUrl = (id: number) => `https://dev.azure.com/${ORG}/${PROJECT}/_workitems/edit/${id}`;
const sha = (n: number) => String(n).repeat(40).slice(0, 40);

function commit(n: number, authoredAt: string, extra: Partial<GithubCommit> = {}): GithubCommit {
  return {
    repo: "exemplo/app",
    repoBaseUrl: REPO_URL,
    sha: sha(n),
    message: `Commit ${n}`,
    authoredAt,
    authorEmail: ME,
    authorLogin: "dev-exemplo",
    workItemIds: [],
    ...extra,
  };
}

function pr(number: string, extra: Partial<GithubPullRequest> = {}): GithubPullRequest {
  return {
    repo: "exemplo/app",
    repoBaseUrl: REPO_URL,
    number,
    title: `PR ${number}`,
    state: "ABERTO",
    openedAt: "2026-11-05T12:00:00Z",
    mergedAt: null,
    commitShas: [],
    workItemIds: [],
    ...extra,
  };
}

function find(rows: Candidate[], key: string): Candidate {
  const row = rows.find((candidate) => candidate.key === key);
  assert.ok(row, `item ${key} não encontrado`);
  return row;
}

function scenario(): Comparison {
  const marco = marcoState({
    pbis: [
      // Mesmo status do Azure: bloqueado.
      { id: uuid(1), planId: PLAN_ID, title: "PBI 101", originUrl: wiUrl(101), status: "EM_DESENVOLVIMENTO", occurredAt: "2026-11-03T12:00:00Z" },
      // Status mudou no Azure.
      { id: uuid(2), planId: PLAN_ID, title: "PBI 102", originUrl: wiUrl(102), status: "EM_DESENVOLVIMENTO", occurredAt: "2026-11-03T12:00:00Z" },
      // Existe em outro plano.
      { id: uuid(3), planId: OTHER_PLAN_ID, title: "PBI 103", originUrl: wiUrl(103), status: "ATRIBUIDO", occurredAt: "2026-09-03T12:00:00Z" },
      // Cadastrado à mão, sem link: possível duplicado do 104.
      { id: uuid(4), planId: PLAN_ID, title: "Ajustar tela de login", originUrl: null, status: "ATRIBUIDO", occurredAt: "2026-11-03T12:00:00Z" },
    ],
    pbiStatusHistory: [
      { pbiId: uuid(1), fromStatus: null, toStatus: "EM_DESENVOLVIMENTO", occurredAt: "2026-11-03T12:00:00Z" },
      { pbiId: uuid(2), fromStatus: null, toStatus: "EM_DESENVOLVIMENTO", occurredAt: "2026-11-03T12:00:00Z" },
    ],
    commits: [
      // Cadastrado com SHA abreviado.
      { id: uuid(10), planId: PLAN_ID, sha: sha(1).slice(0, 7), repositoryId: REPO_ID, repository: "app", occurredAt: "2026-11-04T12:00:00Z" },
      { id: uuid(11), planId: PLAN_ID, sha: sha(2), repositoryId: REPO_ID, repository: "app", occurredAt: "2026-11-04T12:00:00Z" },
    ],
    pullRequests: [
      { id: uuid(20), planId: PLAN_ID, title: "PR 7", url: `${REPO_URL}/pull/7`, repositoryId: REPO_ID, externalId: "7", state: "ABERTO", openedAt: "2026-11-04T12:00:00Z", mergedAt: null },
    ],
    pbiCommits: [{ pbiId: uuid(1), commitId: uuid(10) }],
  });

  const azurePbis = [
    azurePbi(101, [revision("Em Desenvolvimento", ME, "2026-11-03T12:00:00Z")]),
    azurePbi(102, [
      revision("Em Desenvolvimento", ME, "2026-11-03T12:00:00Z"),
      revision("Done", ME, "2026-11-10T12:00:00Z"),
    ]),
    azurePbi(103, [revision("New", ME, "2026-11-04T12:00:00Z")]),
    azurePbi(104, [revision("New", ME, "2026-11-04T12:00:00Z")], { title: "Ajustar Tela de Login" }),
    azurePbi(105, [revision("Removed", ME, "2026-11-04T12:00:00Z")]),
    azurePbi(106, [
      revision("Pronto para Desenvolver", ME, "2026-11-04T12:00:00Z"),
      revision("Em Desenvolvimento", OTHER, "2026-11-05T12:00:00Z"),
    ]),
    azurePbi(107, [revision("Em Teste", ME, "2026-11-04T12:00:00Z")]),
    azurePbi(108, [revision("New", ME, "2026-11-06T12:00:00Z")], {
      links: { commitShas: [sha(3).slice(0, 10)], pullRequests: [], unknown: [] },
    }),
    azurePbi(109, [revision("Em Desenvolvimento", OTHER, "2026-11-06T12:00:00Z")]),
  ];

  const commits = [
    commit(1, "2026-11-04T12:00:00Z", { workItemIds: [101] }), // já existe e já vinculado
    commit(2, "2026-11-04T12:00:00Z", { workItemIds: [101] }), // existe sem vínculo
    commit(3, "2026-11-06T12:00:00Z"), // novo, vinculado ao 108 pelo Azure
    commit(4, "2026-10-01T12:00:00Z"), // fora do período
    commit(5, "2026-11-07T12:00:00Z", { workItemIds: [999] }), // menção a PBI desconhecido
  ];
  const pullRequests = [
    pr("7", { state: "MERGED", mergedAt: "2026-11-08T12:00:00Z", commitShas: [sha(2), sha(3)] }),
    pr("8", { commitShas: [sha(3)], workItemIds: [108] }),
    pr("9", { openedAt: "2026-10-01T12:00:00Z" }),
  ];

  return compareAll({ config, marco, plan: marco.plans[0]!, azurePbis, github: { commits, pullRequests } });
}

describe("comparação com o Marco", () => {
  const result = scenario();

  it("classifica os PBIs", () => {
    const situation = (id: number) => find(result.pbis, `pbi:${id}`).situation;
    assert.equal(situation(101), "JA_EXISTE");
    assert.equal(situation(102), "STATUS_MUDOU");
    assert.equal(situation(103), "OUTRO_PLANO");
    assert.equal(situation(104), "POSSIVEL_DUPLICADO");
    assert.equal(situation(105), "REMOVIDO");
    assert.equal(situation(106), "CONFIRMAR_POSSE");
    assert.equal(situation(107), "SEM_MAPEAMENTO");
    assert.equal(situation(108), "NOVO");
    assert.equal(result.pbis.some((row) => row.key === "pbi:109"), false, "nunca foi do usuário");
  });

  it("bloqueia o que não pode ser importado e deixa desmarcado o que pede decisão", () => {
    const pbi = (id: number) => find(result.pbis, `pbi:${id}`);
    assert.equal(pbi(101).selectable, false);
    assert.equal(pbi(105).selectable, false);
    assert.equal(pbi(104).selectable && !pbi(104).preselected, true);
    assert.equal(pbi(106).selectable && !pbi(106).preselected, true);
    assert.equal(pbi(108).preselected, true);
  });

  it("gera a atualização de status só com a mudança nova", () => {
    const item = find(result.pbis, "pbi:102").item;
    assert.deepEqual(item, {
      action: "update-status",
      marcoPbiId: uuid(2),
      workItemId: 102,
      originUrl: wiUrl(102),
      title: "PBI 102",
      transitions: [{ status: "ENTREGUE", occurredAt: "2026-11-10T12:00:00Z" }],
    });
  });

  it("classifica os commits, inclusive SHA abreviado e fora do período", () => {
    const commitRow = (n: number) => find(result.commits, `commit:exemplo/app:${sha(n)}`);
    assert.equal(commitRow(1).situation, "JA_EXISTE");
    assert.equal(commitRow(2).situation, "VINCULO_NOVO");
    assert.deepEqual(commitRow(2).item, {
      action: "link",
      marcoCommitId: uuid(11),
      repository: { name: "exemplo/app", baseUrl: REPO_URL },
      sha: sha(2),
      pbiWorkItemIds: [101],
    });
    assert.equal(commitRow(3).situation, "NOVO");
    assert.deepEqual((commitRow(3).item as { pbiWorkItemIds: number[] }).pbiWorkItemIds, [108]);
    assert.equal(commitRow(4).situation, "FORA_DO_PERIODO");
    assert.equal(commitRow(4).selectable, false, "commit fora do período não é importado");
    assert.deepEqual((commitRow(5).item as { pbiWorkItemIds: number[] }).pbiWorkItemIds, [], "PBI desconhecido não vira vínculo");
  });

  it("classifica os PRs e atualiza o estado com os vínculos que faltam", () => {
    const pr7 = find(result.pullRequests, "pr:exemplo/app#7");
    assert.equal(pr7.situation, "STATUS_MUDOU");
    assert.deepEqual(pr7.item, {
      action: "update",
      marcoPullRequestId: uuid(20),
      repository: { name: "exemplo/app", baseUrl: REPO_URL },
      number: "7",
      title: "PR 7",
      state: "MERGED",
      mergedAt: "2026-11-08T12:00:00Z",
      commitShas: [sha(2), sha(3)],
      pbiWorkItemIds: [],
    });
    const pr8 = find(result.pullRequests, "pr:exemplo/app#8");
    assert.equal(pr8.situation, "NOVO");
    assert.deepEqual((pr8.item as { pbiWorkItemIds: number[] }).pbiWorkItemIds, [108]);
    const pr9 = find(result.pullRequests, "pr:exemplo/app#9");
    assert.equal(pr9.situation, "FORA_DO_PERIODO");
    assert.equal(pr9.selectable && !pr9.preselected, true);
  });

  it("monta o arquivo com a seleção padrão e aponta vínculos sem PBI", () => {
    const marco = marcoState();
    const file = buildImportFile({
      selection: defaultSelection(result),
      plan: marco.plans[0]!,
      marco,
      generator: { name: "marco-import", version: "0.0.0" },
      now: new Date("2026-11-20T12:00:00Z"),
    });
    assert.equal(file.kind, "marco-import");
    assert.equal(file.formatVersion, 1);
    assert.deepEqual(file.basedOn, marco.backup);
    assert.deepEqual(file.pbis.map((row) => row.workItemId).sort(), [102, 108]);
    assert.deepEqual(file.repositories, [{ name: "exemplo/app", baseUrl: REPO_URL }]);
    assert.deepEqual(danglingWorkItems(file, new Set([101])), []);
    assert.deepEqual(danglingWorkItems({ ...file, pbis: [] }, new Set([101])), [108]);
  });
});

describe("mudanças de status pendentes", () => {
  it("registra só o status atual, com aviso, quando a data do Azure é anterior ao Marco", () => {
    const result = pendingTransitions(
      { id: "x", planId: PLAN_ID, title: "t", originUrl: null, status: "ATRIBUIDO", occurredAt: "2026-11-10T12:00:00Z" },
      [{ occurredAt: "2026-11-10T12:00:00Z" }],
      [{ status: "ENTREGUE", occurredAt: "2026-11-09T12:00:00Z", azureState: "Done" }],
    );
    assert.deepEqual(result.transitions, [{ status: "ENTREGUE", occurredAt: "2026-11-09T12:00:00Z" }]);
    assert.match(result.warning ?? "", /anterior ao último registro/);
  });
});
