/**
 * URLs de repositório no formato do Marco.
 *
 * O Marco guarda a URL base do repositório (`https://github.com/org/repo`) sem barra final e sem
 * `.git`, e monta a partir dela os links de commit (`/commit/<sha>`) e de PR (`/pull/<n>`).
 * A comparação ignora maiúsculas, porque o GitHub não diferencia `Org/Repo` de `org/repo`.
 */

/** Mesma normalização do Marco: remove espaços, barras finais e `.git`. */
export function normalizeRepoBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
}

/** Chave de comparação de repositórios: URL normalizada, em minúsculas. */
export function repoKey(baseUrl: string): string {
  return normalizeRepoBaseUrl(baseUrl).toLowerCase();
}

/** URL base de um repositório do GitHub a partir do endereço web e de `owner/name`. */
export function githubRepoBaseUrl(webUrl: string, fullName: string): string {
  return normalizeRepoBaseUrl(`${webUrl.replace(/\/+$/, "")}/${fullName}`);
}
