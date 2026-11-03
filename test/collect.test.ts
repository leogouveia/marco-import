/**
 * Coleta com `fetch` simulado: exercita URLs, paginação, autenticação e a gravação/reprodução
 * das respostas (--dump / --replay) sem rede.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { AzureClient } from "../src/azure/client.js";
import { collectAzurePbis } from "../src/azure/collect.js";
import { GithubClient } from "../src/github/client.js";
import { collectGithub } from "../src/github/collect.js";
import { HttpError } from "../src/http/client.js";
import { Tape } from "../src/http/tape.js";
import { ME, ORG, PROJECT, testConfig } from "./helpers.js";

const config = testConfig();
const range = { from: "2026-11-03", to: "2026-11-24" };
const realFetch = globalThis.fetch;
const requests: Array<{ method: string; url: string; auth: string | null }> = [];

type Route = (url: URL, body: unknown) => { status?: number; body: unknown; headers?: Record<string, string> } | null;

function stubFetch(route: Route) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    requests.push({ method: init?.method ?? "GET", url: url.toString(), auth: headers.get("authorization") });
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const reply = route(url, body);
    if (!reply) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: reply.headers });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  requests.length = 0;
});

const azureRoute: Route = (url, body) => {
  if (url.pathname.endsWith("/_apis/wit/wiql")) return { body: { workItems: [{ id: 10 }, { id: 11 }] } };
  if (url.pathname.endsWith("/_apis/wit/workitemsbatch")) {
    assert.deepEqual((body as { ids: number[] }).ids, [10, 11]);
    return {
      body: {
        value: [
          { id: 10, fields: { "System.Title": "Tela A", "System.State": "Done", "System.AssignedTo": { uniqueName: ME } }, relations: [] },
          { id: 11, fields: { "System.Title": "Tela B", "System.State": "New", "System.AssignedTo": { uniqueName: "x@exemplo.com" } } },
        ],
      },
    };
  }
  const revisions = /workItems\/(\d+)\/revisions/.exec(url.pathname);
  if (revisions) {
    const id = Number(revisions[1]);
    const assignee = id === 10 ? ME : "x@exemplo.com";
    return {
      body: {
        value: [
          { id, rev: 1, fields: { "System.State": "New", "System.AssignedTo": { uniqueName: assignee }, "System.ChangedDate": "2026-11-04T12:00:00Z" } },
          { id, rev: 2, fields: { "System.State": id === 10 ? "Done" : "New", "System.AssignedTo": { uniqueName: assignee }, "System.ChangedDate": "2026-11-06T12:00:00Z" } },
        ],
      },
    };
  }
  return null;
};

describe("coleta do Azure", () => {
  it("consulta, lê em lote e monta o histórico, só com itens do usuário", async () => {
    stubFetch(azureRoute);
    const client = new AzureClient(config.azure.base_url, "7.1", "token-azure", new Tape({ kind: "live" }));
    const pbis = await collectAzurePbis(client, config.azure, range);

    assert.deepEqual(pbis.map((pbi) => pbi.workItemId), [10]);
    assert.equal(pbis[0]!.url, `https://dev.azure.com/${ORG}/${PROJECT}/_workitems/edit/10`);
    assert.equal(pbis[0]!.revisions.length, 2);
    const wiql = requests.find((req) => req.url.includes("/_apis/wit/wiql"))!;
    assert.match(wiql.url, /api-version=7\.1/);
    assert.equal(wiql.auth, `Basic ${Buffer.from(":token-azure").toString("base64")}`);
  });

  it("grava as respostas com --dump e reproduz sem rede com --replay", async () => {
    const dir = mkdtempSync(join(tmpdir(), "marco-import-"));
    try {
      stubFetch(azureRoute);
      const recorded = await collectAzurePbis(
        new AzureClient(config.azure.base_url, "7.1", "segredo-123", new Tape({ kind: "record", dir })),
        config.azure,
        range,
      );
      const files = readdirSync(dir);
      assert.ok(files.length > 0);
      for (const file of files) {
        assert.equal(readFileSync(join(dir, file), "utf8").includes("segredo-123"), false, "token não pode ser gravado");
      }

      globalThis.fetch = (() => {
        throw new Error("sem rede no modo de reprodução");
      }) as typeof fetch;
      const replayed = await collectAzurePbis(
        new AzureClient(config.azure.base_url, "7.1", "", new Tape({ kind: "replay", dir })),
        config.azure,
        range,
      );
      assert.deepEqual(replayed, recorded);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("coleta do GitHub", () => {
  const sha = (c: string) => c.repeat(40);
  const rawCommit = (s: string, email: string, login: string | null, date: string, message = "msg AB#10") => ({
    sha: s,
    commit: { message, author: { email, date } },
    author: login ? { login } : null,
  });

  it("pagina commits por autor, junta commits seus dos PRs e lê o estado do PR", async () => {
    stubFetch((url) => {
      const path = url.pathname;
      if (path === "/repos/exemplo/app/commits") {
        const author = url.searchParams.get("author");
        if (author === "dev-exemplo" && !url.searchParams.get("page")) {
          return {
            body: [rawCommit(sha("a"), ME, "dev-exemplo", "2026-11-04T12:00:00Z")],
            headers: { link: `<${url.origin}${path}?author=dev-exemplo&page=2>; rel="next"` },
          };
        }
        if (author === "dev-exemplo") return { body: [rawCommit(sha("b"), ME, "dev-exemplo", "2026-11-05T12:00:00Z", "outra\n\ncorpo")] };
        return { body: [rawCommit(sha("a"), ME, "dev-exemplo", "2026-11-04T12:00:00Z")] };
      }
      if (path === "/search/issues") {
        assert.match(url.searchParams.get("q") ?? "", /is:pr author:dev-exemplo repo:exemplo\/app/);
        return { body: { items: [{ number: 5 }] } };
      }
      if (path === "/repos/exemplo/app/pulls/5") {
        return { body: { number: 5, title: "Tela AB#10", body: null, state: "closed", created_at: "2026-11-05T12:00:00Z", merged_at: "2026-11-06T12:00:00Z" } };
      }
      if (path === "/repos/exemplo/app/pulls/5/commits") {
        return {
          body: [
            rawCommit(sha("b"), ME, "dev-exemplo", "2026-11-05T12:00:00Z"),
            rawCommit(sha("c"), "123+dev@users.noreply.github.com", "dev-exemplo", "2026-11-06T12:00:00Z"),
            rawCommit(sha("d"), "colega@exemplo.com", "colega", "2026-11-06T12:00:00Z"),
          ],
        };
      }
      return null;
    });

    const data = await collectGithub(new GithubClient(config.github.api_url, "t", new Tape({ kind: "live" })), config.github, range);
    assert.deepEqual(data.commits.map((row) => row.sha).sort(), [sha("a"), sha("b"), sha("c")], "commit do colega fica de fora");
    const b = data.commits.find((row) => row.sha === sha("b"))!;
    assert.equal(b.message, "outra");
    assert.deepEqual(data.commits.find((row) => row.sha === sha("a"))!.workItemIds, [10]);
    assert.equal(data.pullRequests.length, 1);
    assert.equal(data.pullRequests[0]!.state, "MERGED");
    assert.deepEqual(data.pullRequests[0]!.workItemIds, [10]);
    assert.deepEqual(data.pullRequests[0]!.commitShas, [sha("b"), sha("c"), sha("d")]);
    assert.ok(requests.every((req) => req.auth === "Bearer t"));
  });

  it("explica quando o token precisa de autorização SSO", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "Resource protected by organization SAML enforcement." }), {
        status: 403,
        headers: { "x-github-sso": "required; url=https://github.com/orgs/x/sso" },
      })) as typeof fetch;
    const client = new GithubClient(config.github.api_url, "t", new Tape({ kind: "live" }));
    await assert.rejects(client.get("repos/exemplo/app"), (err: unknown) => err instanceof HttpError && /SSO/.test(err.message));
  });
});
