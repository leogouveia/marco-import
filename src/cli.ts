#!/usr/bin/env node
/**
 * Linha de comando do marco-import.
 *
 * Uso: marco-import --backup <backup-do-marco.zip> [opções]
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { runApp } from "./app.js";
import type { TapeMode } from "./http/tape.js";
import { parseBackupVersion } from "./marco/backup.js";
import { DEFAULT_CONFIG_PATH } from "./shared/paths.js";

const HELP = `marco-import: importa PBIs do Azure Boards e commits/PRs do GitHub para o Marco.

Uso:
  marco-import --backup <arquivo.zip> [opções]

Opções:
  -b, --backup <arquivo>   ZIP existente exportado pelo Marco. Entrada obrigatória.
      --backup-version <versão>  auto, 1, 2 ou 3 (sem opção, pergunta; com --yes, auto).
  -c, --config <arquivo>   Configuração (padrão: marco-import.yaml na pasta do projeto).
  -o, --out <pasta>        Pasta do JSON gerado (padrão: pasta do projeto; veja output.directory).
  -p, --plan <id>          ID do plano no Marco (sem isso, pergunta).
      --dump <pasta>       Grava as respostas do Azure e do GitHub (para diagnóstico).
      --replay <pasta>     Reproduz uma coleta gravada com --dump, sem rede e sem tokens.
  -y, --yes                Sem perguntas: usa a seleção padrão (exige --plan com mais de um plano).
  -h, --help               Mostra esta ajuda.
  -v, --version            Mostra a versão.

Entrada: backup ZIP existente (Dispositivo → Exportar backup no Marco).
Saída: marco-import-<data>.json, para selecionar na tela Importar do Marco.

Tokens: AZURE_DEVOPS_PAT e GITHUB_TOKEN (ou azure.token e github.token na configuração).
`;

function packageInfo(): { name: string; version: string } {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    name: string;
    version: string;
  };
  return { name: pkg.name, version: pkg.version };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      backup: { type: "string", short: "b" },
      "backup-version": { type: "string" },
      config: { type: "string", short: "c", default: DEFAULT_CONFIG_PATH },
      out: { type: "string", short: "o" },
      plan: { type: "string", short: "p" },
      dump: { type: "string" },
      replay: { type: "string" },
      yes: { type: "boolean", short: "y", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const generator = packageInfo();
  if (values.version) {
    console.log(generator.version);
    return 0;
  }
  if (!values.backup) {
    console.error("Informe o backup do Marco com --backup <arquivo.zip>.\n");
    console.error(HELP);
    return 2;
  }
  if (values.dump && values.replay) {
    console.error("Use --dump ou --replay, não os dois.");
    return 2;
  }

  const backupVersion = values["backup-version"] === undefined ? undefined : parseBackupVersion(values["backup-version"]);

  const tape: TapeMode = values.dump
    ? { kind: "record", dir: values.dump }
    : values.replay
      ? { kind: "replay", dir: values.replay }
      : { kind: "live" };

  await runApp({
    configPath: values.config,
    backupPath: values.backup,
    backupVersion,
    outDir: values.out,
    planId: values.plan,
    tape,
    yes: values.yes,
    generator,
  });
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    // Ctrl+C durante uma pergunta: sai sem pilha de erro.
    if (err instanceof Error && err.name === "ExitPromptError") {
      console.log("\nCancelado.");
      process.exitCode = 130;
      return;
    }
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  },
);
