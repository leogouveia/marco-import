import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHistory } from "../src/domain/history.js";
import { decideOwnership } from "../src/domain/ownership.js";
import { StatusMapper } from "../src/domain/status.js";
import { ConfigSchema } from "../src/config/schema.js";
import { azurePbi, ME, OTHER, revision, testConfig } from "./helpers.js";

const config = testConfig();
const mapper = new StatusMapper(config.azure.status_map, config.azure.removed_states);
const me = new Set([ME]);
const ownership = new Set(["em desenvolvimento", "em code review"]);

describe("mapeamento de estados", () => {
  it("mapeia sem diferenciar maiúsculas e reconhece removido e sem mapeamento", () => {
    assert.deepEqual(mapper.map("done"), { kind: "status", status: "ENTREGUE" });
    assert.deepEqual(mapper.map("Removed"), { kind: "removed" });
    assert.deepEqual(mapper.map("Em Teste"), { kind: "unmapped" });
  });

  it("recusa um estado ligado a dois status", () => {
    const raw = {
      azure: {
        organization: "o",
        base_url: "https://dev.azure.com/o",
        projects: [{ name: "p" }],
        user: { email: ME },
        status_map: { ATRIBUIDO: ["Done"], ENTREGUE: ["Done"] },
      },
      github: { login: "l", author_emails: [ME], repositories: ["a/b"] },
    };
    assert.equal(ConfigSchema.safeParse(raw).success, false);
  });
});

describe("regra de posse", () => {
  it("é do usuário quando está atribuído a ele hoje", () => {
    const pbi = azurePbi(1, [revision("New", ME, "2026-11-03T12:00:00Z")]);
    assert.deepEqual(decideOwnership(pbi, me, ownership), { kind: "mine", reason: "atual" });
  });

  it("continua do usuário depois de passar por desenvolvimento com ele", () => {
    const pbi = azurePbi(2, [
      revision("Em Desenvolvimento", ME, "2026-11-03T12:00:00Z"),
      revision("Aguardando Homologação", OTHER, "2026-11-05T12:00:00Z"),
    ]);
    assert.deepEqual(decideOwnership(pbi, me, ownership), { kind: "mine", reason: "desenvolvimento" });
  });

  it("pede confirmação quando foi do usuário só antes do desenvolvimento", () => {
    const pbi = azurePbi(3, [
      revision("Pronto para Desenvolver", ME, "2026-11-03T12:00:00Z"),
      revision("Em Desenvolvimento", OTHER, "2026-11-04T12:00:00Z"),
    ]);
    assert.deepEqual(decideOwnership(pbi, me, ownership), { kind: "confirm", lastAssignee: OTHER });
  });

  it("ignora o que nunca foi do usuário", () => {
    const pbi = azurePbi(4, [revision("Em Desenvolvimento", OTHER, "2026-11-04T12:00:00Z")]);
    assert.deepEqual(decideOwnership(pbi, me, ownership), { kind: "not-mine" });
  });
});

describe("histórico de status", () => {
  it("começa quando o item passa para o usuário e junta revisões com o mesmo status", () => {
    const history = buildHistory(
      [
        revision("New", null, "2026-11-01T12:00:00Z"),
        revision("New", ME, "2026-11-03T12:00:00Z"),
        revision("Em Desenvolvimento", ME, "2026-11-04T12:00:00Z"),
        revision("Em Code Review", ME, "2026-11-05T12:00:00Z"),
        revision("Done", ME, "2026-11-06T12:00:00Z"),
      ],
      mapper,
      me,
    );
    assert.deepEqual(
      history.points.map((point) => [point.status, point.occurredAt]),
      [
        ["ATRIBUIDO", "2026-11-03T12:00:00Z"],
        ["EM_DESENVOLVIMENTO", "2026-11-04T12:00:00Z"],
        ["ENTREGUE", "2026-11-06T12:00:00Z"],
      ],
    );
    assert.equal(history.removed, false);
  });

  it("lista estados sem mapeamento, marca removido e aponta regressão de entrega", () => {
    const history = buildHistory(
      [
        revision("Em Desenvolvimento", ME, "2026-11-03T12:00:00Z"),
        revision("Aguardando Homologação", ME, "2026-11-04T12:00:00Z"),
        revision("Em Desenvolvimento", ME, "2026-11-05T12:00:00Z"),
        revision("Em Teste", ME, "2026-11-06T12:00:00Z"),
        revision("Removed", ME, "2026-11-07T12:00:00Z"),
      ],
      mapper,
      me,
    );
    assert.deepEqual(history.unmappedStates, ["Em Teste"]);
    assert.equal(history.removed, true);
    assert.equal(history.regressions.length, 1);
    assert.equal(history.regressions[0]!.from, "ENTREGUE");
  });
});
