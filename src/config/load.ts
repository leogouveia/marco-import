/**
 * Leitura e validação do arquivo de configuração.
 *
 * Tokens podem vir do YAML ou de variáveis de ambiente; a variável sempre prevalece, para que o
 * arquivo possa ser compartilhado sem segredos.
 */
import { readFileSync, statSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { ConfigSchema, type ResolvedConfig } from "./schema.js";
import { missingInputMessage } from "../shared/paths.js";

export const TOKEN_ENV = {
  azure: "AZURE_DEVOPS_PAT",
  github: "GITHUB_TOKEN",
} as const;

export class ConfigError extends Error {}

/**
 * Lê e valida a configuração.
 *
 * @param requireTokens Falso no modo de reprodução (`--replay`), que não acessa a rede.
 */
export function loadConfig(path: string, options: { requireTokens: boolean }): ResolvedConfig {
  let raw: unknown;
  try {
    raw = parse(readFileSync(path, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ConfigError(`${missingInputMessage("Arquivo de configuração", path)}\nCopie marco-import.example.yaml para marco-import.yaml e preencha a configuração, ou use --config <arquivo>.`);
    }
    throw new ConfigError(`Não foi possível ler ${path}: ${(err as Error).message}`);
  }

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError(`Configuração inválida em ${path}:\n${z.prettifyError(parsed.error)}`);
  }
  const config = parsed.data;

  const azureToken = process.env[TOKEN_ENV.azure] || config.azure.token || "";
  const githubToken = process.env[TOKEN_ENV.github] || config.github.token || "";
  if (options.requireTokens) {
    const missing = [
      !azureToken && `azure.token ou ${TOKEN_ENV.azure}`,
      !githubToken && `github.token ou ${TOKEN_ENV.github}`,
    ].filter(Boolean);
    if (missing.length) {
      throw new ConfigError(`Informe os tokens: ${missing.join(", ")}`);
    }
  }

  warnIfSecretsExposed(path, Boolean(config.azure.token || config.github.token));

  return {
    ...config,
    azure: { ...config.azure, token: azureToken },
    github: { ...config.github, token: githubToken },
  };
}

/** Avisa quando o arquivo guarda tokens e pode ser lido por outros usuários (Linux/macOS). */
function warnIfSecretsExposed(path: string, hasTokens: boolean) {
  if (!hasTokens || process.platform === "win32") return;
  const mode = statSync(path).mode & 0o077;
  if (mode !== 0) {
    console.warn(
      `Aviso: ${path} contém tokens e pode ser lido por outros usuários. Use: chmod 600 ${path}`,
    );
  }
}
