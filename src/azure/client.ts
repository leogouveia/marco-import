/**
 * Acesso à API REST do Azure DevOps (Boards).
 *
 * Documentação: https://learn.microsoft.com/rest/api/azure/devops/wit
 * Autenticação: Personal Access Token com o escopo "Work Items (Read)".
 */
import { HttpClient } from "../http/client.js";
import type { Tape } from "../http/tape.js";

type WiqlResponse = { workItems: Array<{ id: number }> };
type BatchResponse = { value: RawWorkItem[] };
type RevisionsResponse = { value: RawRevision[] };

export type RawWorkItem = {
  id: number;
  fields: Record<string, unknown>;
  relations?: Array<{ rel?: string; url?: string }>;
};

export type RawRevision = { id: number; rev: number; fields: Record<string, unknown> };

/** A API de lote aceita no máximo 200 IDs por chamada. */
const BATCH_SIZE = 200;
const REVISIONS_PAGE = 200;

export class AzureClient {
  private readonly http: HttpClient;

  constructor(
    private readonly baseUrl: string,
    private readonly apiVersion: string,
    token: string,
    tape: Tape,
  ) {
    this.http = new HttpClient({
      service: "Azure DevOps",
      headers: { Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}` },
      tape,
      explain: (status) =>
        status === 401 || status === 203
          ? "token inválido, expirado ou sem o escopo Work Items (Read)"
          : null,
    });
  }

  private url(path: string, query: Record<string, string | number> = {}): string {
    const url = new URL(`${this.baseUrl.replace(/\/+$/, "")}/${path}`);
    url.searchParams.set("api-version", this.apiVersion);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    return url.toString();
  }

  /** Executa uma consulta WIQL no projeto e devolve os IDs encontrados. */
  async queryIds(project: string, wiql: string): Promise<number[]> {
    const { data } = await this.http.post<WiqlResponse>(
      this.url(`${encodeURIComponent(project)}/_apis/wit/wiql`),
      { query: wiql },
    );
    return data.workItems.map((item) => item.id);
  }

  /** Lê work items em lote, com as relações (vínculos com commits e PRs). */
  async getWorkItems(ids: number[]): Promise<RawWorkItem[]> {
    const items: RawWorkItem[] = [];
    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
      const { data } = await this.http.post<BatchResponse>(this.url("_apis/wit/workitemsbatch"), {
        ids: ids.slice(start, start + BATCH_SIZE),
        $expand: "Relations",
        errorPolicy: "Omit",
      });
      items.push(...data.value.filter(Boolean));
    }
    return items;
  }

  /** Todas as revisões de um work item, em ordem. */
  async getRevisions(id: number): Promise<RawRevision[]> {
    const revisions: RawRevision[] = [];
    for (let skip = 0; ; skip += REVISIONS_PAGE) {
      const { data } = await this.http.get<RevisionsResponse>(
        this.url(`_apis/wit/workItems/${id}/revisions`, { $top: REVISIONS_PAGE, $skip: skip }),
      );
      revisions.push(...data.value);
      if (data.value.length < REVISIONS_PAGE) return revisions;
    }
  }
}
