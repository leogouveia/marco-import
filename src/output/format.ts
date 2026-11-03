/**
 * Formato do arquivo de importação (versão 1), lido pela tela "Importar" do Marco.
 *
 * O arquivo descreve O QUE importar; quem grava é o Marco, pelos mesmos comandos do cadastro
 * manual, com as mesmas regras (plano, fechamento, Meta, vínculos). Vínculos usam chaves
 * externas (número do work item, SHA do commit), resolvidas pelo Marco no momento de aplicar:
 * assim um vínculo funciona tanto com registros já existentes quanto com os criados pelo arquivo.
 *
 * Mudanças incompatíveis exigem incrementar `formatVersion`. Detalhes em docs/FORMATO.md.
 */
import type { MarcoStatus } from "../domain/status.js";
import type { PullRequestState } from "../github/types.js";
import type { MarcoBackupInfo } from "../marco/types.js";

export const IMPORT_FILE_KIND = "marco-import";
export const IMPORT_FORMAT_VERSION = 1;

export type RepositoryRef = { name: string; baseUrl: string };

export type StatusEntry = { status: MarcoStatus; occurredAt: string };

export type ImportPbi =
  | {
      action: "create";
      workItemId: number;
      originUrl: string;
      title: string;
      /** Histórico em ordem; o primeiro registro é o status e a data de criação no Marco. */
      history: StatusEntry[];
    }
  | {
      action: "update-status";
      marcoPbiId: string;
      workItemId: number;
      originUrl: string;
      title: string;
      /** Mudanças de status a registrar, em ordem; a última é o status atual. */
      transitions: StatusEntry[];
    };

export type ImportCommit =
  | {
      action: "create";
      repository: RepositoryRef;
      sha: string;
      message: string;
      occurredAt: string;
      /** PBIs (work items) a vincular. */
      pbiWorkItemIds: number[];
    }
  | {
      action: "link";
      marcoCommitId: string;
      repository: RepositoryRef;
      sha: string;
      pbiWorkItemIds: number[];
    };

export type ImportPullRequest =
  | {
      action: "create";
      repository: RepositoryRef;
      number: string;
      title: string;
      state: PullRequestState;
      openedAt: string;
      mergedAt: string | null;
      /** Commits do PR a vincular (os que existirem no Marco ou forem criados pelo arquivo). */
      commitShas: string[];
      pbiWorkItemIds: number[];
    }
  | {
      action: "update";
      marcoPullRequestId: string;
      repository: RepositoryRef;
      number: string;
      title: string;
      state: PullRequestState;
      mergedAt: string | null;
      commitShas: string[];
      pbiWorkItemIds: number[];
    };

export type ImportFile = {
  kind: typeof IMPORT_FILE_KIND;
  formatVersion: typeof IMPORT_FORMAT_VERSION;
  generatedAt: string;
  generator: { name: string; version: string };
  /** Backup usado na comparação; a tela do Marco avisa se os dados mudaram desde então. */
  basedOn: MarcoBackupInfo;
  plan: { id: string; employeeName: string; startDate: string; endDate: string; closedOn: string | null };
  /** Repositórios usados pelos itens; o Marco cadastra os que não existirem (pela URL base). */
  repositories: RepositoryRef[];
  pbis: ImportPbi[];
  commits: ImportCommit[];
  pullRequests: ImportPullRequest[];
};
