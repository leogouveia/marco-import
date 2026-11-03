/** Escolha do plano do Marco que recebe a importação. */
import { select } from "@inquirer/prompts";
import type { MarcoPlan } from "../marco/types.js";
import { formatCivil } from "../shared/time.js";

export function describePlan(plan: MarcoPlan): string {
  const closing = plan.closedOn ? ` · fechado em ${formatCivil(plan.closedOn)}` : "";
  return `${plan.employeeName} · ${formatCivil(plan.startDate)} a ${formatCivil(plan.endDate)}${closing}`;
}

/**
 * Plano escolhido pelo ID (opção --plan), automaticamente quando só há um, ou pela pergunta.
 * Planos mais recentes aparecem primeiro.
 */
export async function choosePlan(plans: MarcoPlan[], options: { planId?: string; interactive: boolean }): Promise<MarcoPlan> {
  if (!plans.length) throw new Error("O backup não tem planos. Crie um plano no Marco antes de importar.");
  if (options.planId) {
    const plan = plans.find((row) => row.id === options.planId);
    if (!plan) throw new Error(`Plano ${options.planId} não encontrado no backup.`);
    return plan;
  }
  if (plans.length === 1) return plans[0]!;
  if (!options.interactive) throw new Error("Há mais de um plano no backup: informe --plan <id>.");

  const sorted = [...plans].sort((a, b) => b.startDate.localeCompare(a.startDate));
  return select({
    message: "Qual plano recebe a importação?",
    choices: sorted.map((plan) => ({ name: describePlan(plan), value: plan, description: `ID ${plan.id}` })),
    pageSize: 10,
  });
}
