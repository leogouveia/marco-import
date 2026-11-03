import assert from "node:assert/strict";
import { describe, it } from "node:test";
import JSZip from "jszip";
import { BackupError, parseBackupVersion, parseMarcoBackup } from "../src/marco/backup.js";
import { chooseBackupVersion } from "../src/ui/backup-version.js";
import { PLAN_ID, REPO_ID, REPO_URL, uuid } from "./helpers.js";

function backupZip(formatVersion = 3, entities: Record<string, unknown> = {}): JSZip {
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({ kind: "marco-local-backup", formatVersion, exportedAt: "2026-11-20T12:00:00.000Z", generation: "g", baseRevision: 3, dirty: true }),
  );
  zip.file(
    "snapshot.json",
    JSON.stringify({
      schemaVersion: 2,
      entities: {
        plans: [{ id: PLAN_ID, employeeName: "Pessoa", startDate: "2026-11-03", endDate: "2026-11-24", closedOn: null, notes: null }],
        repositories: [{ id: REPO_ID, name: "app", baseUrl: REPO_URL, provider: "GITHUB" }],
        pbis: [],
        pbiStatusHistory: [],
        commits: [],
        pullRequests: [
          { id: uuid(1), planId: PLAN_ID, title: "PR", url: `${REPO_URL}/pull/1`, repositoryId: REPO_ID, externalId: "1", state: "FECHADO", openedAt: "2026-11-04T12:00:00Z", mergedAt: null },
        ],
        pbiCommits: [],
        pbiPullRequests: [],
        pullRequestCommits: [],
        impediments: [],
        ...entities,
      },
    }),
  );
  return zip;
}

describe("backup do Marco", () => {
  it("lê o formato 3, ignora campos extras e converte PR FECHADO em CANCELADO", async () => {
    const state = await parseMarcoBackup(backupZip());
    assert.equal(state.plans[0]!.id, PLAN_ID);
    assert.equal(state.backup.dirty, true);
    assert.equal(state.pullRequests[0]!.state, "CANCELADO");
  });

  it("recusa outro formato com mensagem clara", async () => {
    await assert.rejects(parseMarcoBackup(backupZip(4)), (err: unknown) => err instanceof BackupError && /formato 4/.test(err.message));
  });

  it("recusa ZIP sem os arquivos do Marco", async () => {
    await assert.rejects(parseMarcoBackup(new JSZip()), BackupError);
  });
});


describe("versões de backup", () => {
  for (const version of [1, 2, 3] as const) {
    it(`lê o formato ${version} por detecção e por seleção explícita`, async () => {
      const zip = backupZip(version);
      assert.deepEqual(await parseMarcoBackup(zip), await parseMarcoBackup(zip, version));
    });
  }

  it("lê snapshot legado v1 sem os campos novos do plano e preserva o período efetivo", async () => {
    const zip = backupZip(1);
    const raw = JSON.parse(await zip.file("snapshot.json")!.async("string"));
    raw.schemaVersion = 1;
    delete raw.entities.plans[0].closedOn;
    raw.entities.pullRequests[0].state = "FECHADO";
    zip.file("snapshot.json", JSON.stringify(raw));
    const state = await parseMarcoBackup(zip, 1);
    assert.equal(state.plans[0]!.closedOn, null);
    assert.equal(state.plans[0]!.endDate, "2026-11-24");
    assert.equal(state.pullRequests[0]!.state, "CANCELADO");
  });

  it("recusa versão selecionada diferente da versão do arquivo", async () => {
    await assert.rejects(parseMarcoBackup(backupZip(1), 3), /selecionada a versão 3.*formato 1/);
  });

  it("valida a opção da CLI", () => {
    assert.equal(parseBackupVersion("auto"), "auto");
    for (const version of [1, 2, 3]) assert.equal(parseBackupVersion(String(version)), version);
    for (const invalid of ["0", "4", "1.0", "", "v1"]) {
      assert.throws(() => parseBackupVersion(invalid), BackupError);
    }
  });

  it("respeita seleção explícita e usa auto sem perguntas", async () => {
    assert.equal(await chooseBackupVersion({version: 1, interactive: true}), 1);
    assert.equal(await chooseBackupVersion({interactive: false}), "auto");
  });
});
