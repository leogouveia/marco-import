/**
 * Formato do arquivo de configuração (`marco-import.yaml`).
 *
 * Todo dado específico de empresa (organização, projetos, e-mails, repositórios, mapeamento de
 * estados e tokens) fica nesse arquivo, fora do repositório. O código não conhece nenhum desses
 * valores. Veja `marco-import.example.yaml`.
 */
import { z } from "zod";
import { MARCO_STATUSES, type MarcoStatus } from "../domain/status.js";

const StateList = z.array(z.string().trim().min(1)).default([]);

const StatusMapSchema = z.object({
  ATRIBUIDO: StateList,
  EM_DESENVOLVIMENTO: StateList,
  ENTREGUE: StateList,
  HOMOLOGADO: StateList,
  EM_PRODUCAO: StateList,
});

const AzureSchema = z.object({
  /** Nome da organização no Azure DevOps (o trecho depois de dev.azure.com/). */
  organization: z.string().trim().min(1),
  /** URL base da organização, por exemplo https://dev.azure.com/minha-org. */
  base_url: z.url(),
  /** Personal Access Token com leitura de Work Items. A variável AZURE_DEVOPS_PAT prevalece. */
  token: z.string().optional(),
  api_version: z.string().default("7.1"),
  projects: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        /** ID do projeto; opcional, só documenta a origem. */
        id: z.string().optional(),
      }),
    )
    .min(1),
  /** Tipos de work item importados. */
  work_item_types: z.array(z.string().trim().min(1)).min(1).default(["Product Backlog Item"]),
  user: z.object({
    /** E-mail (uniqueName) do usuário no Azure DevOps. */
    email: z.string().trim().min(3),
    /** Outros nomes com que o usuário aparece em "Assigned To", se houver. */
    aliases: z.array(z.string().trim().min(1)).default([]),
    /** UserSK do Analytics (OData). Opcional: a coleta usa a API REST, que identifica pelo e-mail. */
    user_sk: z.string().optional(),
  }),
  /** Estados do Azure por status do Marco. */
  status_map: StatusMapSchema,
  /** Estados que indicam PBI removido do board: não importa e avisa. */
  removed_states: StateList,
  /**
   * Estados em que, se o PBI estava com o usuário, ele continua sendo do usuário mesmo que
   * depois mude de responsável. Padrão: os estados mapeados para EM_DESENVOLVIMENTO.
   */
  ownership_states: z.array(z.string().trim().min(1)).optional(),
});

const GithubSchema = z.object({
  /** API REST do GitHub. Para github.com, o padrão. */
  api_url: z.url().default("https://api.github.com"),
  /** Endereço web, usado para montar a URL base dos repositórios no Marco. */
  web_url: z.url().default("https://github.com"),
  /** Token com leitura de conteúdo e pull requests. A variável GITHUB_TOKEN prevalece. */
  token: z.string().optional(),
  /** Login do usuário, para achar PRs e commits feitos pela conta. */
  login: z.string().trim().min(1),
  /** E-mails usados nos commits. Ficam só nesta configuração; não vão para o Marco. */
  author_emails: z.array(z.string().trim().min(3)).min(1),
  /** Repositórios consultados, no formato dono/nome. */
  repositories: z
    .array(z.string().trim().regex(/^[^/\s]+\/[^/\s]+$/, "Use o formato dono/nome"))
    .min(1),
});

export const ConfigSchema = z
  .object({
    azure: AzureSchema,
    github: GithubSchema,
    output: z.object({ directory: z.string().default(".") }).default({ directory: "." }),
  })
  .superRefine((config, ctx) => {
    // Um estado do Azure só pode levar a um status do Marco, e não pode estar também em "removido".
    const seen = new Map<string, MarcoStatus | "removed_states">();
    const check = (state: string, owner: MarcoStatus | "removed_states") => {
      const key = state.toLowerCase();
      const previous = seen.get(key);
      if (previous && previous !== owner) {
        ctx.addIssue({
          code: "custom",
          path: ["azure", "status_map"],
          message: `O estado "${state}" aparece em ${previous} e em ${owner}`,
        });
      }
      seen.set(key, owner);
    };
    for (const status of MARCO_STATUSES) {
      for (const state of config.azure.status_map[status]) check(state, status);
    }
    for (const state of config.azure.removed_states) check(state, "removed_states");
  });

export type Config = z.infer<typeof ConfigSchema>;

/** Configuração pronta para uso, com tokens resolvidos. */
export type ResolvedConfig = Config & {
  azure: Config["azure"] & { token: string };
  github: Config["github"] & { token: string };
};
