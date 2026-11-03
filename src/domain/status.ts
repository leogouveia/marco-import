/**
 * Status de PBI do Marco e o mapeamento a partir dos estados do Azure Boards.
 *
 * O Marco tem cinco status fixos. Cada estado do Azure é ligado a um deles no arquivo de
 * configuração (`azure.status_map`). Estados em `azure.removed_states` indicam PBI removido do
 * board: não são importados e geram aviso. Estados fora do mapeamento também não são importados.
 */

export const MARCO_STATUSES = [
  "ATRIBUIDO",
  "EM_DESENVOLVIMENTO",
  "ENTREGUE",
  "HOMOLOGADO",
  "EM_PRODUCAO",
] as const;

export type MarcoStatus = (typeof MARCO_STATUSES)[number];

/** Rótulos usados no Marco, para exibição. */
export const MARCO_STATUS_LABELS: Record<MarcoStatus, string> = {
  ATRIBUIDO: "Atribuído",
  EM_DESENVOLVIMENTO: "Em desenvolvimento",
  ENTREGUE: "Entregue",
  HOMOLOGADO: "Homologado",
  EM_PRODUCAO: "Em produção",
};

/** Resultado do mapeamento de um estado do Azure. */
export type MappedState =
  | { kind: "status"; status: MarcoStatus }
  | { kind: "removed" }
  | { kind: "unmapped" };

/** Mapeamento pronto para consulta, montado a partir da configuração. */
export class StatusMapper {
  private readonly byState = new Map<string, MarcoStatus>();
  private readonly removed = new Set<string>();

  constructor(statusMap: Record<MarcoStatus, string[]>, removedStates: string[]) {
    for (const status of MARCO_STATUSES) {
      for (const state of statusMap[status]) {
        this.byState.set(StatusMapper.key(state), status);
      }
    }
    for (const state of removedStates) {
      this.removed.add(StatusMapper.key(state));
    }
  }

  /** Os nomes de estado são comparados sem diferenciar maiúsculas e espaços nas pontas. */
  private static key(state: string): string {
    return state.trim().toLowerCase();
  }

  map(state: string): MappedState {
    const key = StatusMapper.key(state);
    if (this.removed.has(key)) return { kind: "removed" };
    const status = this.byState.get(key);
    return status ? { kind: "status", status } : { kind: "unmapped" };
  }

  /** Estados do Azure que mapeiam para um status do Marco. */
  statesFor(status: MarcoStatus): string[] {
    return [...this.byState.entries()].filter(([, value]) => value === status).map(([state]) => state);
  }
}
