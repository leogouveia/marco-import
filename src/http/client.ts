/**
 * Cliente HTTP para JSON, usado pelas coletas do Azure DevOps e do GitHub.
 *
 * Usa o `fetch` nativo do Node. Trata limite de requisições (espera e repete), traduz erros
 * comuns em mensagens que dizem o que fazer e integra a gravação/reprodução (`Tape`).
 */
import { KEPT_HEADERS, type Tape } from "./tape.js";

export type JsonResponse<T> = { status: number; headers: Record<string, string>; data: T };

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
  }
}

type ClientOptions = {
  /** Nome do serviço, usado nas mensagens de erro. */
  service: string;
  /** Cabeçalhos enviados em toda requisição (inclui autenticação). */
  headers: Record<string, string>;
  tape: Tape;
  /** Dicas específicas do serviço para um erro, se houver. */
  explain?: (status: number, headers: Record<string, string>) => string | null;
};

const MAX_ATTEMPTS = 4;

export class HttpClient {
  constructor(private readonly options: ClientOptions) {}

  async get<T>(url: string): Promise<JsonResponse<T>> {
    return this.request<T>("GET", url);
  }

  async post<T>(url: string, body: unknown): Promise<JsonResponse<T>> {
    return this.request<T>("POST", url, body);
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<JsonResponse<T>> {
    const tape = this.options.tape;
    if (tape.replaying) {
      const entry = tape.read(method, url, body);
      return { status: entry.status, headers: entry.headers, data: entry.body as T };
    }

    for (let attempt = 1; ; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...this.options.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const headers = Object.fromEntries(response.headers.entries());

      const wait = retryDelayMs(response.status, headers);
      if (wait !== null && attempt < MAX_ATTEMPTS) {
        console.warn(`${this.options.service}: limite de requisições, aguardando ${Math.ceil(wait / 1000)} s...`);
        await sleep(wait);
        continue;
      }

      const text = await response.text();
      if (!response.ok) {
        throw new HttpError(this.describe(response.status, headers, url, text), response.status, url);
      }
      const data = (text ? JSON.parse(text) : null) as T;
      const kept = Object.fromEntries(
        KEPT_HEADERS.filter((name) => headers[name] !== undefined).map((name) => [name, headers[name]!]),
      );
      tape.write({ method, url, requestBody: body, status: response.status, headers: kept, body: data });
      return { status: response.status, headers: kept, data };
    }
  }

  private describe(status: number, headers: Record<string, string>, url: string, text: string): string {
    const specific = this.options.explain?.(status, headers);
    const generic =
      status === 401
        ? "token inválido ou expirado"
        : status === 403
          ? "sem permissão para este recurso"
          : status === 404
            ? "não encontrado (confira nomes na configuração e o acesso do token)"
            : `erro HTTP ${status}`;
    const detail = extractMessage(text);
    return `${this.options.service}: ${specific ?? generic}${detail ? ` — ${detail}` : ""} [${url}]`;
  }
}

/** Tempo de espera quando o serviço pede para repetir depois; `null` quando não é o caso. */
function retryDelayMs(status: number, headers: Record<string, string>): number | null {
  const limited =
    status === 429 ||
    status === 503 ||
    (status === 403 && (headers["retry-after"] !== undefined || headers["x-ratelimit-remaining"] === "0"));
  if (!limited) return null;
  const retryAfter = Number(headers["retry-after"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  const reset = Number(headers["x-ratelimit-reset"]);
  if (Number.isFinite(reset) && reset > 0) return Math.max(1000, reset * 1000 - Date.now());
  return 5000;
}

function extractMessage(text: string): string | null {
  try {
    const json = JSON.parse(text) as { message?: string };
    return json.message ?? null;
  } catch {
    return text.trim().slice(0, 200) || null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
