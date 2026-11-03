/**
 * Fluxo principal:
 *
 * 1. lê a configuração e o backup do Marco;
 * 2. o usuário escolhe o plano;
 * 3. coleta PBIs no Azure e commits/PRs no GitHub (ou reproduz uma coleta gravada);
 * 4. compara com o Marco e mostra o resumo;
 * 5. o usuário escolhe o que importar;
 * 6. grava o arquivo para a tela "Importar" do Marco.
 */
import { confirm } from "@inquirer/prompts";
import { AzureClient } from "./azure/client.js";
import { collectAzurePbis } from "./azure/collect.js";
import { compareAll } from "./compare/run.js";
import { MarcoIndex } from "./compare/marco-index.js";
import { loadConfig } from "./config/load.js";
import { GithubClient } from "./github/client.js";
import { collectGithub } from "./github/collect.js";
import { Tape, type TapeMode } from "./http/tape.js";
import { readMarcoBackup, type BackupVersionChoice } from "./marco/backup.js";
import { planRange } from "./marco/types.js";
import { buildImportFile, danglingWorkItems, writeImportFile } from "./output/write.js";
import { choosePlan, describePlan } from "./ui/plan.js";
import { createProgress } from "./ui/progress.js";
import { askSelection, defaultSelection } from "./ui/select.js";
import { printSummary } from "./ui/summary.js";
import { chooseBackupVersion } from "./ui/backup-version.js";
import { configuredOutputDirectory } from "./shared/paths.js";

export type AppOptions = {
  configPath: string;
  backupPath: string;
  backupVersion?: BackupVersionChoice;
  outDir?: string;
  planId?: string;
  tape: TapeMode;
  /** Sem perguntas: aceita a seleção padrão. */
  yes: boolean;
  generator: { name: string; version: string };
};

export async function runApp(options: AppOptions): Promise<void> {
  const replaying = options.tape.kind === "replay";
  const config = loadConfig(options.configPath, { requireTokens: !replaying });
  const backupVersion = await chooseBackupVersion({ version: options.backupVersion, interactive: !options.yes });
  const marco = await readMarcoBackup(options.backupPath, backupVersion);
  if (marco.backup.dirty) {
    console.warn("Aviso: o backup foi exportado com alterações ainda não sincronizadas nesse dispositivo.");
  }

  const plan = await choosePlan(marco.plans, { planId: options.planId, interactive: !options.yes });
  console.log(`Plano: ${describePlan(plan)}`);
  const range = planRange(plan);

  const tape = new Tape(options.tape);
  const progress = createProgress();
  const azure = new AzureClient(config.azure.base_url, config.azure.api_version, config.azure.token, tape);
  const github = new GithubClient(config.github.api_url, config.github.token, tape);

  const azurePbis = await collectAzurePbis(azure, config.azure, range, progress.update);
  const githubData = await collectGithub(github, config.github, range, progress.update);
  progress.done(
    `Coletados: ${azurePbis.length} PBIs, ${githubData.commits.length} commits, ${githubData.pullRequests.length} PRs.`,
  );
  if (options.tape.kind === "record") console.log(`Respostas gravadas em ${options.tape.dir} (não publique: contém dados de trabalho).`);

  const comparison = compareAll({ config, marco, plan, azurePbis, github: githubData });
  printSummary(comparison);

  const selection = options.yes ? defaultSelection(comparison) : await askSelection(comparison);
  const file = buildImportFile({ selection, plan, marco, generator: options.generator });
  const total = file.pbis.length + file.commits.length + file.pullRequests.length;
  if (!total) {
    console.log("Nada selecionado; nenhum arquivo gerado.");
    return;
  }

  const index = new MarcoIndex(marco, config.azure.organization);
  const dangling = danglingWorkItems(file, new Set(index.workItemIdsInPlan(plan.id)));
  if (dangling.length) {
    console.warn(
      `Aviso: há vínculos com PBIs que não foram selecionados e não existem no plano (${dangling.map((id) => `#${id}`).join(", ")}). O Marco vai ignorá-los.`,
    );
  }

  const summary = `${file.pbis.length} PBIs, ${file.commits.length} commits e ${file.pullRequests.length} PRs`;
  if (!options.yes && !(await confirm({ message: `Gerar o arquivo com ${summary}?`, default: true }))) {
    console.log("Cancelado; nenhum arquivo gerado.");
    return;
  }
  const path = writeImportFile(file, options.outDir ?? configuredOutputDirectory(config.output.directory));
  console.log(`Arquivo gerado: ${path}`);
  console.log("No Marco, abra a tela Importar e selecione esse arquivo.");
}
