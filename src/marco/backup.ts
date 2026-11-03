/**
 * Leitura do backup local do Marco (ZIP, formatos 1, 2 e 3).
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
import { missingInputMessage } from "../shared/paths.js";

export const SUPPORTED_BACKUP_VERSIONS = [1, 2, 3] as const;
export type BackupVersion = (typeof SUPPORTED_BACKUP_VERSIONS)[number];
export type BackupVersionChoice = BackupVersion | "auto";

export function parseBackupVersion(value: string): BackupVersionChoice {
  if (value === "auto") return "auto";
  if (value === "1" || value === "2" || value === "3") return Number(value) as BackupVersion;
  throw new BackupError("Versão de backup inválida. Use --backup-version auto, 1, 2 ou 3.");
}

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

export async function readMarcoBackup(path: string, version: BackupVersionChoice = "auto"): Promise<MarcoState> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await readFile(path));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new BackupError(`${missingInputMessage("Backup de entrada do Marco", path)}\nO argumento --backup lê um ZIP já existente, exportado em Dispositivo → Exportar backup no Marco. O arquivo gerado por esta ferramenta será um JSON separado.`);
    }
    throw new BackupError(`Não foi possível abrir o backup ${path}: ${(err as Error).message}`);
  }
  return parseMarcoBackup(zip, version);
}

export async function parseMarcoBackup(zip: JSZip, version: BackupVersionChoice = "auto"): Promise<MarcoState> {
  const manifestText = await zip.file("manifest.json")?.async("string");
  const snapshotText = await zip.file("snapshot.json")?.async("string");
  if (!manifestText || !snapshotText) {
    throw new BackupError("Backup inválido: faltam manifest.json ou snapshot.json. Exporte em Dispositivo → Exportar backup.");
  }

  const manifest = ManifestSchema.safeParse(JSON.parse(manifestText));
  if (!manifest.success) {
    throw new BackupError(`Backup inválido (manifest.json):\n${z.prettifyError(manifest.error)}`);
  }
  const detected = manifest.data.formatVersion;
  if (!SUPPORTED_BACKUP_VERSIONS.some((supported) => supported === detected)) {
    throw new BackupError(
      `Backup no formato ${detected}; formatos suportados: ${SUPPORTED_BACKUP_VERSIONS.join(", ")}.`,
    );
  }
  if (version !== "auto" && version !== detected) {
    throw new BackupError(
      `Foi selecionada a versão ${version}, mas o manifest.json informa formato ${detected}. Use --backup-version ${detected} ou --backup-version auto.`,
    );
  }

  const snapshot = SnapshotSchema.safeParse(JSON.parse(snapshotText));
  if (!snapshot.success) {
    throw new BackupError(`Backup inválido (snapshot.json):\n${z.prettifyError(snapshot.error)}`);
  }

  const { exportedAt, generation, baseRevision, dirty } = manifest.data;
  return { backup: { exportedAt, generation, baseRevision, dirty }, ...snapshot.data.entities };
}
