import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import JSZip from "jszip";
import { ConfigError, loadConfig } from "../src/config/load.js";
import { BackupError, readMarcoBackup } from "../src/marco/backup.js";
import { configuredOutputDirectory, DEFAULT_CONFIG_PATH, PROJECT_DIRECTORY } from "../src/shared/paths.js";
import { buildImportFile, writeImportFile } from "../src/output/write.js";
import { marcoState, testConfig } from "./helpers.js";

describe("caminhos de entrada e saída", () => {
  it("usa a pasta do projeto por padrão, mesmo com o terminal em outra pasta", () => {
    const original = process.cwd();
    try {
      process.chdir(tmpdir());
      assert.equal(testConfig().output.directory, ".");
      assert.equal(configuredOutputDirectory(testConfig().output.directory), PROJECT_DIRECTORY);
      assert.equal(DEFAULT_CONFIG_PATH, resolve(PROJECT_DIRECTORY, "marco-import.yaml"));
      assert.equal(configuredOutputDirectory("saida"), resolve(PROJECT_DIRECTORY, "saida"));
      assert.equal(configuredOutputDirectory(tmpdir()), resolve(tmpdir()));
    } finally {
      process.chdir(original);
    }
  });

  it("identifica o YAML ausente pelo caminho completo", () => {
    const dir = mkdtempSync(join(tmpdir(), "marco-paths-"));
    try {
      const path = join(dir, "config ausente.yaml");
      assert.throws(() => loadConfig(path, { requireTokens: false }), (err: unknown) =>
        err instanceof ConfigError && err.message.includes(path) && /Arquivo de configuração não encontrado/.test(err.message));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("identifica o ZIP ausente e explica que ele é a entrada", async () => {
    const dir = mkdtempSync(join(tmpdir(), "marco-paths-"));
    try {
      const path = join(dir, "backup ausente.zip");
      await assert.rejects(readMarcoBackup(path), (err: unknown) =>
        err instanceof BackupError && err.message.includes(path) && /ZIP já existente/.test(err.message));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lê ZIP existente e gera JSON em caminhos com espaços", async () => {
    const dir = mkdtempSync(join(tmpdir(), "marco com espaços-"));
    try {
      const state = marcoState();
      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify({kind: "marco-local-backup", formatVersion: 3, ...state.backup}));
      zip.file("snapshot.json", JSON.stringify({entities: state}));
      const backup = join(dir, "backup do Marco.zip");
      writeFileSync(backup, await zip.generateAsync({type: "nodebuffer"}));
      const loaded = await readMarcoBackup(backup);
      assert.equal(loaded.plans[0]!.id, state.plans[0]!.id);
      const file = buildImportFile({selection: {pbis: [], commits: [], pullRequests: []}, plan: loaded.plans[0]!, marco: loaded, generator: {name: "test", version: "0"}});
      const output = writeImportFile(file, dir);
      assert.equal(output.endsWith(".json"), true);
      assert.equal(output.startsWith(dir), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
