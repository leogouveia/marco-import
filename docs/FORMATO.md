# Arquivo de importação (formato 1)

O marco-import gera um JSON que a tela **Importar** do Marco lê. O arquivo diz **o que**
importar; quem grava é o Marco, usando os mesmos comandos do cadastro manual e, portanto, as
mesmas regras (período do plano, fechamento, Meta e vínculos).

## Estrutura

```jsonc
{
  "kind": "marco-import",
  "formatVersion": 1,
  "generatedAt": "2026-11-20T12:00:00.000Z",
  "generator": { "name": "marco-import", "version": "0.1.0" },
  // Backup usado na comparação. O Marco avisa se os dados mudaram desde então.
  "basedOn": { "exportedAt": "...", "generation": "...", "baseRevision": 7, "dirty": false },
  "plan": { "id": "<uuid>", "employeeName": "...", "startDate": "2026-11-03", "endDate": "2026-11-24", "closedOn": null },
  "repositories": [{ "name": "dono/repo", "baseUrl": "https://github.com/dono/repo" }],
  "pbis": [ /* ImportPbi */ ],
  "commits": [ /* ImportCommit */ ],
  "pullRequests": [ /* ImportPullRequest */ ]
}
```

Instantes estão em ISO-8601 UTC. Datas civis (`startDate`, `endDate`, `closedOn`) são
`YYYY-MM-DD`.

## Itens

| Tipo | `action` | Efeito esperado no Marco |
| --- | --- | --- |
| PBI | `create` | Cria o PBI com `originUrl` = link do work item, status e data do primeiro registro de `history`; registra as mudanças seguintes, em ordem. |
| PBI | `update-status` | Registra cada item de `transitions` no PBI `marcoPbiId`, em ordem. |
| Commit | `create` | Cria o commit (SHA, mensagem, data) no repositório e vincula aos PBIs de `pbiWorkItemIds`. |
| Commit | `link` | Vincula o commit `marcoCommitId` aos PBIs de `pbiWorkItemIds`. |
| PR | `create` | Cria o PR (número, título, estado, abertura e merge) e vincula `commitShas` e `pbiWorkItemIds`. |
| PR | `update` | Atualiza estado e merge do PR `marcoPullRequestId` e vincula `commitShas` e `pbiWorkItemIds`. |

## Resolução de referências

- **Repositório:** pela `baseUrl`, sem diferenciar maiúsculas. Se não existir, o Marco cadastra.
- **PBI em vínculos:** pelo número do work item no `originUrl` (`/_workitems/edit/<n>`), seja de
  um PBI que já existe no plano, seja de um criado pelo próprio arquivo.
- **Commit em vínculos:** pelo SHA, no repositório do PR.
- Vínculo com referência que não existe no plano é ignorado e informado no resumo.

## Ordem de aplicação

Repositórios, PBIs, commits, PRs e, por último, os vínculos. Cada item é aplicado e relatado
separadamente; uma falha não impede os demais.

## Compatibilidade

Mudança incompatível exige incrementar `formatVersion`. O Marco recusa versões que não conhece.
