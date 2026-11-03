/** Escolha do formato de entrada; a versão real sempre é conferida no manifesto. */
import { select } from "@inquirer/prompts";
import type { BackupVersionChoice } from "../marco/backup.js";

export async function chooseBackupVersion(options: {
  version?: BackupVersionChoice;
  interactive: boolean;
}): Promise<BackupVersionChoice> {
  if (options.version !== undefined) return options.version;
  if (!options.interactive) return "auto";
  return select<BackupVersionChoice>({
    message: "Qual é a versão do backup do Marco?",
    default: "auto",
    choices: [
      { name: "Detectar automaticamente pelo arquivo", value: "auto" },
      { name: "Versão 1", value: 1 },
      { name: "Versão 2", value: 2 },
      { name: "Versão 3", value: 3 },
    ],
  });
}
