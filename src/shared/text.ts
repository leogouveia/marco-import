/** Funções de texto usadas na comparação e na exibição. */

/** Primeira linha de uma mensagem de commit, sem espaços nas pontas. */
export function firstLine(message: string): string {
  return (message.split(/\r?\n/, 1)[0] ?? "").trim();
}

/**
 * Normaliza um título para comparação aproximada: minúsculas, sem acentos, sem pontuação e com
 * espaços simples. Só serve para apontar "possível duplicado"; nunca decide sozinho.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * IDs de work item mencionados no formato `AB#123`, o padrão de vínculo entre GitHub e Azure
 * Boards. Devolve números únicos, na ordem em que aparecem.
 */
export function workItemMentions(text: string | null | undefined): number[] {
  if (!text) return [];
  const ids = new Set<number>();
  for (const match of text.matchAll(/\bAB#(\d+)\b/gi)) {
    ids.add(Number(match[1]));
  }
  return [...ids];
}

/** Encurta um texto para caber em uma linha do terminal. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}
