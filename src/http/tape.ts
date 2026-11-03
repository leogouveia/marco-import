/**
 * Gravação e reprodução de respostas HTTP.
 *
 * - `--dump <pasta>`: a coleta real grava cada resposta em JSON nessa pasta.
 * - `--replay <pasta>`: a coleta lê as respostas gravadas, sem rede e sem tokens.
 *
 * Isso permite investigar ou testar a coleta fora do ambiente onde Azure e GitHub estão
 * acessíveis. Só o corpo da resposta e alguns cabeçalhos de paginação são gravados; tokens e
 * cabeçalhos de autenticação nunca. Os arquivos contêm dados de trabalho: a pasta é ignorada
 * pelo git e não deve ser publicada.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Cabeçalhos de resposta necessários para paginar. */
export const KEPT_HEADERS = ["link", "x-ms-continuationtoken"] as const;

export type TapeEntry = {
  method: string;
  url: string;
  requestBody?: unknown;
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export type TapeMode = { kind: "live" } | { kind: "record"; dir: string } | { kind: "replay"; dir: string };

/** Nome de arquivo estável para uma requisição (método, URL e corpo). */
export function tapeFileName(method: string, url: string, requestBody?: unknown): string {
  const hash = createHash("sha256")
    .update(`${method} ${url} ${requestBody === undefined ? "" : JSON.stringify(requestBody)}`)
    .digest("hex")
    .slice(0, 20);
  return `${hash}.json`;
}

export class Tape {
  constructor(readonly mode: TapeMode) {
    if (mode.kind === "record") mkdirSync(mode.dir, { recursive: true });
    if (mode.kind === "replay" && !existsSync(mode.dir)) {
      throw new Error(`Pasta de reprodução não encontrada: ${mode.dir}`);
    }
  }

  get replaying(): boolean {
    return this.mode.kind === "replay";
  }

  /** Lê uma resposta gravada. Só no modo de reprodução. */
  read(method: string, url: string, requestBody?: unknown): TapeEntry {
    if (this.mode.kind !== "replay") throw new Error("Tape fora do modo de reprodução");
    const file = join(this.mode.dir, tapeFileName(method, url, requestBody));
    if (!existsSync(file)) {
      throw new Error(`Resposta não gravada para ${method} ${url}. Refaça a coleta com --dump.`);
    }
    return JSON.parse(readFileSync(file, "utf8")) as TapeEntry;
  }

  /** Grava uma resposta. Só no modo de gravação. */
  write(entry: TapeEntry): void {
    if (this.mode.kind !== "record") return;
    const file = join(this.mode.dir, tapeFileName(entry.method, entry.url, entry.requestBody));
    writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`);
  }
}
