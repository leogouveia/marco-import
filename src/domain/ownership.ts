/**
 * Regra de posse: quando um PBI do Azure conta como do usuário.
 *
 * - Está atribuído ao usuário hoje: é do usuário.
 * - Esteve com o usuário em algum estado de "posse" (por padrão, os estados mapeados para
 *   Em desenvolvimento): continua sendo do usuário nas etapas seguintes, mesmo que depois mude
 *   de responsável.
 * - Foi do usuário só antes dessas etapas e hoje está com outra pessoa: pede confirmação.
 * - Nunca foi do usuário: não entra.
 */
import type { AzurePbi } from "../azure/types.js";

export type Ownership =
  | { kind: "mine"; reason: "atual" | "desenvolvimento" }
  | { kind: "confirm"; lastAssignee: string | null }
  | { kind: "not-mine" };

export function decideOwnership(pbi: AzurePbi, me: Set<string>, ownershipStates: Set<string>): Ownership {
  if (pbi.assignedTo && me.has(pbi.assignedTo)) {
    return { kind: "mine", reason: "atual" };
  }
  const mineDuringDevelopment = pbi.revisions.some(
    (rev) => rev.assignedTo !== null && me.has(rev.assignedTo) && ownershipStates.has(rev.state.trim().toLowerCase()),
  );
  if (mineDuringDevelopment) {
    return { kind: "mine", reason: "desenvolvimento" };
  }
  const everMine = pbi.revisions.some((rev) => rev.assignedTo !== null && me.has(rev.assignedTo));
  return everMine ? { kind: "confirm", lastAssignee: pbi.assignedTo } : { kind: "not-mine" };
}
