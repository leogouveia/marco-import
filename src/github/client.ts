/**
 * Acesso à API REST do GitHub.
 *
 * Documentação: https://docs.github.com/rest
 * Autenticação: token com leitura de conteúdo (Contents) e de pull requests. Em organizações
 * com SSO, o token precisa ser autorizado para a organização.
 */
import { HttpClient } from "../http/client.js";
import type { Tape } from "../http/tape.js";

const PER_PAGE = 100;

export class GithubClient {
  private readonly http: HttpClient;

  constructor(
    private readonly apiUrl: string,
    token: string,
    tape: Tape,
  ) {
    this.http = new HttpClient({
      service: "GitHub",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      tape,
      explain: (status, headers) => {
        if (status === 403 && headers["x-github-sso"]) {
          return "o token precisa ser autorizado para o SSO da organização (Configure SSO no token)";
        }
        if (status === 404) return "repositório não encontrado ou sem acesso para este token";
        return null;
      },
    });
  }

  url(path: string, query: Record<string, string | number> = {}): string {
    const url = new URL(`${this.apiUrl.replace(/\/+$/, "")}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    return url.toString();
  }

  async get<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
    return (await this.http.get<T>(this.url(path, query))).data;
  }

  /** Lê todas as páginas de uma listagem, seguindo o cabeçalho `Link: <...>; rel="next"`. */
  async paginate<T>(path: string, query: Record<string, string | number> = {}, limit = 10_000): Promise<T[]> {
    const items: T[] = [];
    let next: string | null = this.url(path, { ...query, per_page: PER_PAGE });
    while (next && items.length < limit) {
      const response: { headers: Record<string, string>; data: T[] | { items: T[] } } = await this.http.get(next);
      const page = Array.isArray(response.data) ? response.data : response.data.items;
      items.push(...page);
      next = nextLink(response.headers["link"]);
    }
    return items;
  }
}

/** Extrai a URL `rel="next"` do cabeçalho Link. */
export function nextLink(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (match?.[1]) return match[1];
  }
  return null;
}
