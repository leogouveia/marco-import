/**
 * Leitura do backup local do Marco (ZIP, formato 3).
 *
 * Só leitura: o arquivo não é alterado. Os campos são validados de forma permissiva (campos a
 * mais são ignorados), para que versões novas do Marco continuem legíveis enquanto o formato
 * do backup for o mesmo.
 */
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { z } from "zod";
import { MARCO_STATUSES } from "../domain/status.js";
import type { MarcoState } from "./types.js";

export const SUPPORTED_BACKUP_VERSION = 3;

const Iso = z.string().min(1);
const Uuid = z.string().min(1);

const ManifestSchema = z.object({
  kind: z.literal("marco-local-backup"),
  formatVersion: z.number(),
  exportedAt: Iso,
  generation: z.string().nullable(),
  baseRevision: z.number(),
  dirty: z.boolean().default(false),
});

const SnapshotSchema = z.object({
  entities: z.object({
    plans: z.array(
      z.object({
        id: Uuid,
        employeeName: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        closedOn: z.string().nullable().default(null),
      }),
    ),
    repositories: z.array(z.object({ id: Uuid, name: z.string(), baseUrl: z.string() })),
    pbis: z.array(
      z.object({
        id: Uuid,
        planId: Uuid,
        title: z.string(),
        originUrl: z.string().nullable(),
        status: z.enum(MARCO_STATUSES),
        occurredAt: Iso,
      }),
    ),
    pbiStatusHistory: z.array(
      z.object({
        pbiId: Uuid,
        fromStatus: z.enum(MARCO_STATUSES).nullable(),
        toStatus: z.enum(MARCO_STATUSES),
        occurredAt: Iso,
      }),
    ),
    commits: z.array(
      z.object({
        id: Uuid,
        planId: Uuid,
        sha: z.string(),
        repositoryId: Uuid.nullable().default(null),
        repository: z.string().nullable().default(null),
        occurredAt: Iso,
      }),
    ),
    pullRequests: z.array(
      z.object({
        id: Uuid,
        planId: Uuid,
        title: z.string(),
        url: z.string(),
        repositoryId: Uuid.nullable().default(null),
        externalId: z.string().nullable().default(null),
        // Registros antigos usam FECHADO, que o Marco lê como CANCELADO.
        state: z
          .string()
          .transform((value) => (value === "FECHADO" ? "CANCELADO" : value))
          .pipe(z.enum(["ABERTO", "MERGED", "CANCELADO"])),
        openedAt: Iso,
        mergedAt: Iso.nullable().default(null),
      }),
    ),
    pbiCommits: z.array(z.object({ pbiId: Uuid, commitId: Uuid })),
    pbiPullRequests: z.array(z.object({ pbiId: Uuid, pullRequestId: Uuid })),
    pullRequestCommits: z.array(z.object({ pullRequestId: Uuid, commitId: Uuid })),
  }),
});

export class BackupError extends Error {}

export async function readMarcoBackup(path: string): Promise<MarcoState> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await readFile(path));
  } catch (err) {
    throw new BackupError(`Não foi possível abrir o backup ${path}: ${(err as Error).message}`);
  }
  return parseMarcoBackup(zip);
}

export async function parseMarcoBackup(zip: JSZip): Promise<MarcoState> {
  const manifestText = await zip.file("manifest.json")?.async("string");
  const snapshotText = await zip.file("snapshot.json")?.async("string");
  if (!manifestText || !snapshotText) {
    throw new BackupError("Backup inválido: faltam manifest.json ou snapshot.json. Exporte em Dispositivo → Exportar backup.");
  }

  const manifest = ManifestSchema.safeParse(JSON.parse(manifestText));
  if (!manifest.success) {
    throw new BackupError(`Backup inválido (manifest.json):\n${z.prettifyError(manifest.error)}`);
  }
  if (manifest.data.formatVersion !== SUPPORTED_BACKUP_VERSION) {
    throw new BackupError(
      `Backup no formato ${manifest.data.formatVersion}; esta versão do marco-import lê o formato ${SUPPORTED_BACKUP_VERSION}. Exporte um backup novo no Marco.`,
    );
  }

  const snapshot = SnapshotSchema.safeParse(JSON.parse(snapshotText));
  if (!snapshot.success) {
    throw new BackupError(`Backup inválido (snapshot.json):\n${z.prettifyError(snapshot.error)}`);
  }

  const { exportedAt, generation, baseRevision, dirty } = manifest.data;
  return { backup: { exportedAt, generation, baseRevision, dirty }, ...snapshot.data.entities };
}
