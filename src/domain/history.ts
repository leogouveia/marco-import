/**
 * Reconstrução do histórico de status do PBI a partir das revisões do Azure.
 *
 * O histórico começa na primeira revisão em que o item está com o usuário (antes disso o
 * trabalho não era dele). Cada estado é convertido para o status do Marco; revisões seguidas com
 * o mesmo status viram um único registro, datado do momento em que o status começou.
 * Estados sem mapeamento são ignorados e listados para o usuário conferir a configuração.
 */
import type { AzureRevision } from "../azure/types.js";
import { MARCO_STATUSES, type MarcoStatus, type StatusMapper } from "./status.js";

export type StatusPoint = {
  status: MarcoStatus;
  /** Instante em que o status começou. */
  occurredAt: string;
  /** Estado do Azure que originou o status. */
  azureState: string;
};

export type History = {
  points: StatusPoint[];
  /** O estado atual indica PBI removido do board. */
  removed: boolean;
  /** Estados encontrados sem mapeamento na configuração. */
  unmappedStates: string[];
  /** O histórico volta de um status de entrega para um anterior (confira o mapeamento). */
  regressions: Array<{ from: MarcoStatus; to: MarcoStatus; occurredAt: string }>;
};

const ORDER = new Map(MARCO_STATUSES.map((status, index) => [status, index]));
const FIRST_DELIVERED = ORDER.get("ENTREGUE")!;

export function buildHistory(revisions: AzureRevision[], mapper: StatusMapper, me: Set<string>): History {
  const firstMine = revisions.findIndex((rev) => rev.assignedTo !== null && me.has(rev.assignedTo));
  const relevant = revisions.slice(firstMine === -1 ? 0 : firstMine);

  const points: StatusPoint[] = [];
  const unmapped = new Set<string>();
  const regressions: History["regressions"] = [];

  for (const rev of relevant) {
    const mapped = mapper.map(rev.state);
    if (mapped.kind === "unmapped") {
      if (rev.state) unmapped.add(rev.state);
      continue;
    }
    if (mapped.kind === "removed") continue;
    const last = points.at(-1);
    if (last?.status === mapped.status) continue;
    if (last && ORDER.get(last.status)! >= FIRST_DELIVERED && ORDER.get(mapped.status)! < ORDER.get(last.status)!) {
      regressions.push({ from: last.status, to: mapped.status, occurredAt: rev.changedDate });
    }
    points.push({ status: mapped.status, occurredAt: rev.changedDate, azureState: rev.state });
  }

  const current = revisions.at(-1);
  return {
    points,
    removed: current ? mapper.map(current.state).kind === "removed" : false,
    unmappedStates: [...unmapped],
    regressions,
  };
}
