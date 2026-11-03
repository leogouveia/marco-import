# marco-import

Ferramenta de linha de comando que coleta os seus **PBIs no Azure Boards** e os seus **commits e
pull requests no GitHub**, compara com os dados do **Marco** e gera um arquivo para importar
na tela **Importar** do Marco.

Ela não grava nada no Marco nem nas ferramentas de origem: só lê e gera um arquivo. Você escolhe
o que entra.

## Como funciona

1. No Marco, exporte um backup em **Dispositivo → Exportar backup** (arquivo `.zip`).
2. Rode o `marco-import` com esse backup (formatos 1, 2 ou 3). Escolha a versão no terminal ou use a detecção automática.
3. Escolha o plano que vai receber os dados.
4. A ferramenta coleta do Azure e do GitHub e mostra cada item com a sua situação:

   | Situação | Pode importar? | Significado |
   | --- | --- | --- |
   | Novo | Sim (marcado) | Não existe no Marco. |
   | Status mudou | Sim (marcado) | Existe, mas o status (PBI) ou o estado (PR) mudou. |
   | Vínculo novo | Sim (marcado) | Existe, mas falta vínculo com PBI, commit ou PR. |
   | Possível duplicado | Sim (desmarcado) | Há no plano um PBI sem link do Azure com o mesmo título. |
   | Confirmar | Sim (desmarcado) | Foi seu antes do desenvolvimento e hoje está com outra pessoa. |
   | Fora do período | PBI e PR: sim (desmarcado). Commit: não | Fora do início/fim do plano escolhido. |
   | Já existe | Não | Igual ao que está no Marco. |
   | Outro plano | Não | Já está em outro plano do Marco. |
   | Removido | Não | Removido do board no Azure (avisa se existir no Marco). |
   | Sem mapeamento | Não | Estado do Azure fora da configuração. |

5. Marque o que quer importar. A ferramenta grava `marco-import-<data>.json` na pasta do projeto por padrão.
6. No Marco, abra **Importar** e selecione o arquivo.

### Regras

- **PBI é seu** quando está atribuído a você hoje, ou quando esteve com você em uma etapa de
  desenvolvimento (continua seu nas etapas seguintes). Se foi seu só antes do desenvolvimento e
  hoje está com outra pessoa, a ferramenta pede confirmação.
- **Histórico do PBI:** começa quando o item passa a ser seu. Cada estado do Azure vira um status
  do Marco (configurável), datado do momento da mudança no Azure.
- **Commits:** os feitos com o seu login ou com qualquer e-mail da configuração, mais os seus
  commits dentro dos seus PRs. Só entram os do período do plano.
- **Vínculos:** vêm dos links do work item no Azure e de menções `AB#123` em commits e PRs.
- **Datas:** o dia de cada evento é o dia em America/Sao_Paulo, como no Marco.

## Requisitos

- Node.js **22.13** ou mais novo e npm.
- Token do Azure DevOps (Personal Access Token) com o escopo **Work Items (Read)**.
- Token do GitHub com leitura de **Contents** e **Pull requests** nos repositórios. Em
  organizações com SSO, autorize o token para a organização.

## Instalação

```bash
git clone <url-deste-repositório> marco-import
cd marco-import
npm ci
npm run build
```

Sem git, baixe o `.zip` da versão desejada na página do repositório e rode os mesmos comandos
dentro da pasta.

Para atualizar: `git pull`, `npm ci` e `npm run build`.

### Install scripts

O campo `allowScripts` do `package.json` lista as dependências autorizadas a rodar scripts de
instalação. Hoje só o `esbuild` (usado pelo `tsx`) tem um: o `postinstall` que valida o binário da
plataforma. A aprovação vale para a versão instalada (`esbuild@<versão>`).

Se o `npm ci` avisar que há install scripts não revisados (por exemplo, depois de atualizar o
`esbuild`), revise e aprove:

```bash
npm install-scripts ls                  # lista os pendentes
npm install-scripts approve esbuild     # aprova (grava no package.json)
npm install-scripts deny <pacote>       # bloqueia
```

Isso exige um npm recente (11.x) com suporte a `allowScripts`. Em versões antigas o campo é
ignorado e os scripts rodam normalmente.

## Configuração

```bash
cp marco-import.example.yaml marco-import.yaml
```

Edite `marco-import.yaml`: organização e projetos do Azure, seu e-mail, mapeamento de estados,
login, e-mails e repositórios do GitHub. Os comentários do exemplo explicam cada campo.

Tokens: prefira variáveis de ambiente, que prevalecem sobre o arquivo.

```bash
# Linux/macOS
export AZURE_DEVOPS_PAT="..."
export GITHUB_TOKEN="..."
```

```powershell
# Windows (PowerShell)
$env:AZURE_DEVOPS_PAT = "..."
$env:GITHUB_TOKEN = "..."
```

Se preferir guardar os tokens no `marco-import.yaml`, deixe o arquivo só na sua máquina: ele é
ignorado pelo git. Não envie tokens por e-mail ou chat; se isso acontecer, revogue-os e gere novos.

## Uso

```bash
npm run import -- --backup /caminho/marco-backup.zip
```

O `--` separa as opções do npm das opções do `marco-import`.

**Windows PowerShell:** dentro da pasta do projeto, use o Node diretamente e coloque os
caminhos entre aspas:

```powershell
npm run build
node .\dist\cli.js --backup "C:\Users\SeuNome\Downloads\marco-backup.zip"
```

Para escolher explicitamente o formato 1:

```powershell
node .\dist\cli.js --backup "C:\Users\SeuNome\Downloads\marco-backup.zip" --backup-version 1
```

A versão é a do **formato do backup**, indicada em `manifest.json`, não a versão da aplicação.
A escolha é conferida contra o arquivo; escolher outra versão não converte o ZIP. As versões
1, 2 e 3 são aceitas. O JSON de saída continua no formato de importação 1.

O caminho de `--backup` deve apontar para um **ZIP já existente**, exportado no Marco em
**Dispositivo → Exportar backup**. Ele é usado para ler os planos e comparar o que já existe.
Não é o nome do arquivo que será gerado.

A saída é **`marco-import-<data>.json`**, um arquivo de texto estruturado. É esse JSON que você
seleciona na tela **Importar** do Marco. Não precisa enviar o ZIP nessa tela nem renomear a
saída para `.txt`.

Por padrão, o JSON fica na **pasta do projeto**, ao lado do `package.json`. `output.directory`
no YAML permite escolher outra pasta; caminhos relativos nesse campo partem da pasta do
projeto. Para trazer uma configuração antiga ao novo padrão, remova `output.directory` ou use
`directory: "."`. A opção `--out` prevalece sobre o YAML; caminhos relativos passados por essa
opção partem da pasta atual do terminal.

Se ocorrer erro de arquivo não encontrado, a mensagem informa o caminho completo procurado e
se está faltando o YAML de configuração ou o ZIP de entrada. Para conferir o ZIP no PowerShell:

```powershell
Test-Path -LiteralPath "C:\Users\SeuNome\Downloads\marco-backup.zip" -PathType Leaf
```

O resultado deve ser `True`. O YAML padrão é procurado na pasta do projeto; `--config` permite
informar outro arquivo. Se o erro mencionar `dist/cli.js`, execute `npm run build` na pasta do
projeto antes de iniciar a ferramenta.

| Opção | Descrição |
| --- | --- |
| `-b, --backup <arquivo>` | Backup do Marco. Obrigatório. |
| `--backup-version <versão>` | Versão do backup: `auto`, `1`, `2` ou `3`. Sem a opção, pergunta; com `--yes`, detecta automaticamente. |
| `-c, --config <arquivo>` | Configuração (padrão: `marco-import.yaml` na pasta do projeto). |
| `-o, --out <pasta>` | Pasta do JSON gerado (padrão: pasta do projeto; configurável em `output.directory`). |
| `-p, --plan <id>` | ID do plano no Marco (sem isso, pergunta). |
| `-y, --yes` | Sem perguntas: usa a seleção padrão. |
| `--dump <pasta>` | Grava as respostas do Azure e do GitHub, para diagnóstico. |
| `--replay <pasta>` | Reproduz uma coleta gravada, sem rede e sem tokens. |

Na seleção: setas navegam, **espaço** marca, **a** marca todos, **enter** confirma. As
observações do item destacado aparecem embaixo da lista.

### Diagnóstico

Se algo não for reconhecido (um estado, um vínculo), rode com `--dump dump/` e confira os JSON
gravados. A pasta tem dados de trabalho: é ignorada pelo git e não deve ser publicada.

## Limitações conhecidas

- O link de PR no Azure traz só o número do PR; quando o mesmo número existe em mais de um
  repositório configurado, o vínculo pelo Azure é ignorado (a menção `AB#` continua valendo).
- A API do GitHub lista no máximo 250 commits por PR.
- Os formatos dos links `vstfs:///GitHub/...` foram implementados pela documentação e precisam
  ser confirmados com uma coleta real (`--dump`).

## Desenvolvimento

```bash
npm test          # testes (sem rede)
npm run typecheck
npm run dev -- --backup <arquivo.zip>   # roda direto do código-fonte (PowerShell: veja Uso)
```

Organização do código:

| Pasta | Conteúdo |
| --- | --- |
| `src/config` | Leitura e validação do YAML. |
| `src/azure` | API do Azure Boards: consulta WIQL, work items, revisões e vínculos. |
| `src/github` | API do GitHub: commits, PRs e commits de cada PR. |
| `src/marco` | Leitura do backup do Marco. |
| `src/domain` | Regras: mapeamento de estados, posse do PBI e histórico de status. |
| `src/compare` | Comparação com o Marco e situação de cada item. |
| `src/ui` | Perguntas e resumo no terminal. |
| `src/output` | Formato e gravação do arquivo de importação ([docs/FORMATO.md](docs/FORMATO.md)). |
| `src/http` | Cliente HTTP, gravação e reprodução de respostas. |
