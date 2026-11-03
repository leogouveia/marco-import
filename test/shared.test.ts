import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readIdentity } from "../src/azure/identity.js";
import { readLinks } from "../src/azure/links.js";
import { buildWiql } from "../src/azure/collect.js";
import { nextLink } from "../src/github/client.js";
import { pullRequestState } from "../src/github/collect.js";
import { normalizeTitle, workItemMentions } from "../src/shared/text.js";
import { businessDay, isWithin } from "../src/shared/time.js";
import { testConfig } from "./helpers.js";

describe("datas", () => {
  it("usa o dia em São Paulo, não o dia UTC", () => {
    assert.equal(businessDay("2026-11-04T02:30:00Z"), "2026-11-03");
    assert.equal(isWithin("2026-11-04T02:30:00Z", { from: "2026-11-01", to: "2026-11-03" }), true);
    assert.equal(isWithin("2026-11-04T03:30:00Z", { from: "2026-11-01", to: "2026-11-03" }), false);
  });
});

describe("texto", () => {
  it("encontra menções AB# sem repetir", () => {
    assert.deepEqual(workItemMentions("Corrige login AB#12 e ab#7 (AB#12)"), [12, 7]);
    assert.deepEqual(workItemMentions(null), []);
  });

  it("normaliza títulos para comparação", () => {
    assert.equal(normalizeTitle("  Ajustar Tela de Login!  "), normalizeTitle("ajustar tela de login"));
    assert.equal(normalizeTitle("Ação"), "acao");
  });
});

describe("Azure", () => {
  it("lê o responsável em objeto ou texto", () => {
    assert.equal(readIdentity({ displayName: "Dev", uniqueName: "Dev@Exemplo.com" }), "dev@exemplo.com");
    assert.equal(readIdentity("Dev <dev@exemplo.com>"), "dev@exemplo.com");
    assert.equal(readIdentity(undefined), null);
  });

  it("reconhece links de commit e PR do GitHub e do Azure Repos", () => {
    const sha = "a".repeat(40);
    const links = readLinks([
      { rel: "ArtifactLink", url: `vstfs:///GitHub/Commit/abc-123%2F${sha}` },
      { rel: "ArtifactLink", url: "vstfs:///GitHub/PullRequest/abc-123%2F42" },
      { rel: "ArtifactLink", url: `vstfs:///Git/Commit/proj%2Frepo%2F${"b".repeat(40)}` },
      { rel: "ArtifactLink", url: "vstfs:///Git/Ref/proj%2Frepo%2FGBmain" },
      { rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/x/_apis/wit/workItems/1" },
    ]);
    assert.deepEqual(links.commitShas, [sha, "b".repeat(40)]);
    assert.deepEqual(links.pullRequests, [{ repoRef: "abc-123", number: "42" }]);
    assert.deepEqual(links.unknown, []);
  });

  it("monta a WIQL com o usuário, os tipos e a data, escapando aspas", () => {
    const config = testConfig();
    const wiql = buildWiql({ ...config.azure, user: { ...config.azure.user, aliases: ["d'avila@exemplo.com"] } }, "Projeto", {
      from: "2026-11-03",
      to: "2026-11-24",
    });
    assert.match(wiql, /\[System\.TeamProject\] = 'Projeto'/);
    assert.match(wiql, /\[System\.AssignedTo\] EVER 'dev@exemplo\.com'/);
    assert.match(wiql, /'d''avila@exemplo\.com'/);
    assert.match(wiql, /IN \('Product Backlog Item'\)/);
    assert.match(wiql, /\[System\.ChangedDate\] >= '2026-11-03'/);
  });
});

describe("GitHub", () => {
  it("segue o link da próxima página", () => {
    const header = '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=5>; rel="last"';
    assert.equal(nextLink(header), "https://api.github.com/x?page=2");
    assert.equal(nextLink('<https://api.github.com/x?page=1>; rel="prev"'), null);
  });

  it("converte o estado do PR", () => {
    assert.equal(pullRequestState({ state: "open", merged_at: null }), "ABERTO");
    assert.equal(pullRequestState({ state: "closed", merged_at: "2026-11-05T10:00:00Z" }), "MERGED");
    assert.equal(pullRequestState({ state: "closed", merged_at: null }), "CANCELADO");
  });
});
