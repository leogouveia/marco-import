/**
 * Leitura do campo "Assigned To".
 *
 * Nas versões atuais da API o campo é um objeto (`IdentityRef`) com `uniqueName`, que costuma
 * ser o e-mail. Versões antigas devolviam texto no formato "Nome <email>". Os dois são aceitos.
 */

export function readIdentity(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const match = /<([^>]+)>/.exec(value);
    return (match?.[1] ?? value).trim().toLowerCase() || null;
  }
  if (typeof value === "object") {
    const ref = value as { uniqueName?: unknown; mailAddress?: unknown };
    const name = typeof ref.uniqueName === "string" ? ref.uniqueName : ref.mailAddress;
    return typeof name === "string" ? name.trim().toLowerCase() || null : null;
  }
  return null;
}

/** Conjunto de identidades do usuário (e-mail principal e apelidos), em minúsculas. */
export function identitySet(email: string, aliases: string[]): Set<string> {
  return new Set([email, ...aliases].map((value) => value.trim().toLowerCase()));
}
