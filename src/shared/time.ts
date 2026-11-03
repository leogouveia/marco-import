/**
 * Datas no padrão do Marco.
 *
 * O Marco usa um único fuso de negócio, America/Sao_Paulo. Um instante (commit, PR, mudança de
 * estado) pertence ao dia em que ocorreu nesse fuso; o dia UTC nunca decide. Datas civis
 * (início do plano, fim, fechamento) são textos `YYYY-MM-DD`, comparáveis como texto.
 */

export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parseInstant(instant: string | Date): Date {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data inválida: ${String(instant)}`);
  }
  return date;
}

/** Dia de negócio (`YYYY-MM-DD` em São Paulo) de um instante. */
export function businessDay(instant: string | Date): string {
  return dayFormatter.format(parseInstant(instant));
}

/** Normaliza um instante para ISO-8601 em UTC, o formato que o Marco grava. */
export function toIsoInstant(instant: string | Date): string {
  return parseInstant(instant).toISOString();
}

/** Período inclusivo de datas civis. */
export type CivilRange = { from: string; to: string };

/** Indica se o dia de negócio do instante está dentro do período (limites inclusivos). */
export function isWithin(instant: string, range: CivilRange): boolean {
  const day = businessDay(instant);
  return day >= range.from && day <= range.to;
}

/** Formata uma data civil `YYYY-MM-DD` como `DD/MM/AAAA`. */
export function formatCivil(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

/** Formata um instante pelo seu dia de negócio, como `DD/MM/AAAA`. */
export function formatInstant(instant: string): string {
  return formatCivil(businessDay(instant));
}
