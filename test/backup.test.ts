import assert from "node:assert/strict";
import { describe, it } from "node:test";
import JSZip from "jszip";
import { BackupError, parseMarcoBackup } from "../src/marco/backup.js";
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
    await assert.rejects(parseMarcoBackup(backupZip(2)), (err: unknown) => err instanceof BackupError && /formato 2/.test(err.message));
  });

  it("recusa ZIP sem os arquivos do Marco", async () => {
    await assert.rejects(parseMarcoBackup(new JSZip()), BackupError);
  });
});
