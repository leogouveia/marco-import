/** Caminhos padrão independentes da pasta em que o terminal foi aberto. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Tanto src/shared quanto dist/shared ficam dois níveis abaixo da raiz do projeto.
export const PROJECT_DIRECTORY = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const DEFAULT_CONFIG_PATH = resolve(PROJECT_DIRECTORY, "marco-import.yaml");

/** Pastas relativas configuradas no YAML são relativas ao projeto. */
export function configuredOutputDirectory(directory: string): string {
  return resolve(PROJECT_DIRECTORY, directory);
}

/** Diagnóstico de entrada ausente, incluindo o caminho efetivamente procurado. */
export function missingInputMessage(label: string, path: string): string {
  return `${label} não encontrado: "${resolve(path)}".\nPasta atual do terminal: "${process.cwd()}".\nUse o caminho de um arquivo existente, entre aspas se houver espaços.`;
}
