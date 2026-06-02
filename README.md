# AlvoWebMkt — Plataforma Interna de Email Marketing

Sprints 1–3.5 — Base técnica, autenticação, clientes, servidores, listas, contatos, importação CSV, campanhas, fila de envio, agendamento e deploy Cloudflare.

## Stack

- **Frontend:** React + Vite + Tailwind CSS → Cloudflare Pages
- **Backend:** Hono → Cloudflare Workers
- **Auth & DB:** Supabase Auth + Postgres

## Estrutura

```
alvowebmkt/
├── apps/
│   ├── web/        # Frontend React (Cloudflare Pages)
│   └── worker/     # API Hono (Cloudflare Workers)
└── migrations/     # SQL para rodar no Supabase
```

---

## Setup local

### 1. Pré-requisitos

- Node.js 20+
- npm 10+
- Conta Supabase
- Conta Cloudflare (para deploy)
- `wrangler` instalado globalmente (opcional, já incluso como devDep): `npm install -g wrangler`

### 2. Supabase

1. Crie um projeto no [Supabase](https://supabase.com).
2. No **SQL Editor**, rode o conteúdo de `migrations/001_initial.sql`.
3. Em **Authentication → Providers**, deixe Email/Password habilitado.
4. Crie o usuário administrador em **Authentication → Users → Invite User**.
5. Colete as chaves em **Settings → API**:
   - Project URL
   - `anon` key
   - `service_role` key
   - JWT Secret (Settings → API → JWT Settings)

### 3. Variáveis de ambiente

**Frontend** — crie `apps/web/.env`:
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_WORKER_URL=http://localhost:8787
```

**Worker** — crie `apps/worker/.dev.vars`:
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_JWT_SECRET=seu-jwt-secret
ENCRYPTION_KEY=<64 chars hex – gere com: openssl rand -hex 32>
```

> ⚠️ Nunca commite `.env` ou `.dev.vars`.

### 4. Instalar dependências

```bash
npm install
```

### 5. Rodar em desenvolvimento

```bash
# Worker (porta 8787) + Frontend (porta 5173) simultaneamente:
npm run dev

# Ou separadamente:
npm run dev:worker
npm run dev:web
```

Acesse `http://localhost:5173` e faça login com o usuário criado no Supabase.

---

## Deploy

### Worker (Cloudflare Workers)

```bash
# Autenticar no Cloudflare
npx wrangler login

# Configurar secrets de produção
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put SUPABASE_JWT_SECRET
npx wrangler secret put ENCRYPTION_KEY

# Deploy
cd apps/worker && npm run deploy
```

### Frontend (Cloudflare Pages)

```bash
cd apps/web && npm run build
```

Configure o projeto no Cloudflare Pages:
- Build command: `npm run build -w apps/web`
- Output directory: `apps/web/dist`
- Root directory: `/`
- Variáveis de ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WORKER_URL` (URL do worker em produção)

---

## Providers de Email

### Maileroo API
- Campo necessário: `api_key`
- Endpoint: `https://smtp.maileroo.com/send`

### SMTP
- Campos: `host`, `port`, `username`, `password`, `encryption` (none/ssl/tls)
- Usa `cloudflare:sockets` para conexão TCP direta no Worker

---

## Segurança

- Credenciais são criptografadas com **AES-256-GCM** antes de salvar.
- A chave de criptografia nunca é exposta via API.
- Credenciais completas nunca são retornadas nas respostas da API.
- JWTs verificados com assinatura HMAC-SHA256 no Worker.
- RLS habilitado no Supabase — apenas usuários autenticados têm acesso.

---

## Sprint 1 – Implementado

- [x] Monorepo npm workspaces (apps/web + apps/worker)
- [x] TypeScript + Tailwind CSS com tokens do design system
- [x] Supabase Auth (login, proteção de rotas, single-admin)
- [x] Migrations SQL (clients, sending_servers, send_logs, campaign_events)
- [x] CRUD de clientes com validação Zod
- [x] CRUD de servidores com formulário dinâmico por provider
- [x] Criptografia AES-256-GCM de credenciais
- [x] Interface `EmailProvider` plugável → Maileroo API + SMTP (cloudflare:sockets)
- [x] Tela de teste de envio + registro em send_logs
- [x] Layout com sidebar + dashboard inicial

## Sprint 2 – Implementado

- [x] Migration SQL (contact_lists, contacts, list_contacts, suppressions, import_jobs, list_cleanups)
- [x] CRUD de listas com contagem de contatos
- [x] CRUD de contatos com filtros, busca e paginação
- [x] Lista de supressão (add/remove manual + atualização automática de status)
- [x] Importação CSV com parser robusto (vírgula/ponto-e-vírgula, aspas, BOM)
- [x] Mapeamento manual de colunas (email, nome, sobrenome, telefone)
- [x] Colunas extras automáticas para custom_fields
- [x] Deduplicação por client_id + email na importação
- [x] Filtragem de suprimidos na importação
- [x] Limpeza de lista (remove vínculos list_contacts, preserva contacts)
- [x] Histórico de limpezas por lista
- [x] Dashboard ampliado: listas, contatos ativos/suprimidos, últimas importações, últimas limpezas
- [x] Sidebar com novas rotas ativas: Listas, Contatos, Supressões, Importações

---

## Importação CSV

### Formatos de CSV suportados

**CSV mínimo (apenas email):**
```csv
email
joao@exemplo.com
maria@exemplo.com
```

**CSV simples com nome e sobrenome:**
```csv
email,nome,sobrenome
joao@exemplo.com,João,Silva
maria@exemplo.com,Maria,Oliveira
```

**CSV com nome completo (auto-split):**
```csv
email,nome
joao@exemplo.com,João da Silva
maria@exemplo.com,Maria Fernanda Oliveira
```
> `nome` = "João da Silva" → `first_name` = "João", `last_name` = "da Silva"

**CSV com telefone:**
```csv
email,nome,sobrenome,telefone
joao@exemplo.com,João,Silva,+5511999999999
```

**CSV com campos extras (→ custom_fields):**
```csv
email,nome,cidade,plano
joao@exemplo.com,João,São Paulo,premium
```
> `cidade` e `plano` são salvos automaticamente em `contacts.custom_fields`

### Auto-detecção de cabeçalhos

O sistema detecta automaticamente as variações mais comuns:

| Campo | Aceito como |
|---|---|
| `email` | email, e-mail, mail, email_address, endereço |
| `first_name` | nome, name, firstname, primeiro nome |
| `last_name` | sobrenome, lastname, surname, último nome |
| `phone` | telefone, phone, celular, whatsapp, mobile |
| `full_name` (auto-split) | nome completo, fullname, full_name |

### Fluxo

1. Acesse **Importações → Nova importação** (ou clique **Importar** em /contacts ou /lists).
2. Selecione **cliente** e **lista de destino**.
3. Faça upload de um `.csv` ou cole o conteúdo diretamente.
4. Visualize o **preview** — campos detectados automaticamente são marcados com ✓.
5. Ajuste o mapeamento se necessário; colunas extras vão para `custom_fields`.
6. Clique **Importar** e veja as estatísticas.

### Regras

| Situação | Comportamento |
|---|---|
| Email vazio ou inválido | Linha ignorada, conta em `invalid_count` |
| Email em suppressions | Linha ignorada, conta em `suppressed_count` |
| Contato já existe no cliente | Atualiza campos vazios; vincula à lista se não estava |
| Contato já na lista | Conta em `duplicate_count`, não duplica |
| Contato novo | Cria contato e vincula à lista |
| Colunas não mapeadas | Salvas automaticamente em `custom_fields` |

---

## Lista de Supressão

- E-mails suprimidos nunca recebem mensagens.
- Ao suprimir um contato, seu status é atualizado e ele é removido de todas as listas.
- Ao adicionar uma supressão manualmente, o contato correspondente (se existir) também é atualizado.
- Remover uma supressão **não** restaura automaticamente o status do contato.

### Mapeamento reason → status do contato

| Reason | Status resultante |
|---|---|
| `unsubscribe` | `unsubscribed` |
| `hard_bounce` | `bounced` |
| `complaint` | `complained` |
| `manual`, `import`, `validation_*` | `suppressed` |

---

## Limpeza de Lista

A limpeza remove de `list_contacts` os contatos com status problemático **sem excluir** os registros de `contacts`.

### O que é removido da lista

- Status `bounced`, `unsubscribed`, `complained`, `suppressed`
- E-mails presentes na tabela `suppressions` do cliente

### O que NÃO é removido

- Contatos `active`
- Contatos com falha temporária (tratado em sprints futuras)

### Histórico

Cada limpeza é registrada em `list_cleanups` e exibida na página de detalhes da lista.

---

## Sprint 3 – Implementado

- [x] Migration SQL (campaigns, campaign_lists, campaign_recipients, send_queue, tracked_links)
- [x] Campos de limite e lote em sending_servers
- [x] Módulo `email-html.ts`: sanitize, variáveis, rodapé de descadastro automático, reescrita de links
- [x] CRUD de campanhas com validação de domínio verificado
- [x] Prepare: geração de destinatários elegíveis (exclui bounce/unsubscribed/complained/suppressed e suppressions)
- [x] Queue: distribuição em lotes com `scheduled_at` calculado por batch_size × interval
- [x] Modos de velocidade: safe / normal / fast / custom com presets
- [x] Processador de fila (`queue-processor.ts`): lock, limites, envio via factory de providers, backoff exponencial
- [x] Pause / Resume / Cancel com eventos em `campaign_events`
- [x] Cron handler para Cloudflare Scheduled Workers
- [x] Endpoint `POST /api/queue/process` para disparo manual
- [x] Páginas: /campaigns, /campaigns/new, /campaigns/:id, /campaigns/:id/recipients
- [x] Preview HTML com dados fictícios (iframe sandbox)
- [x] Envio de teste por e-mail
- [x] Dashboard com campanhas em andamento, enviados/mês e barras de uso dos servidores

---

## Campanhas

### Fluxo completo

```
1. Criar campanha  →  status: draft
2. Preparar destinatários  →  campaign_recipients gerados (elegíveis filtrados)
3. Enfileirar  →  send_queue criado com scheduled_at distribuídos  →  status: queued
4. Cron/processador executa  →  status: sending  →  envia por lotes
5. Completo  →  status: completed
```

### Filtros de elegibilidade (Prepare)

Contatos excluídos dos destinatários:
- Status: `unsubscribed`, `bounced`, `complained`, `suppressed`
- E-mail presente em `suppressions` do cliente

### Como processar a fila localmente

```bash
curl -X POST http://localhost:8787/api/queue/process \
  -H "Authorization: Bearer <seu-jwt>"
```

Chame repetidamente (a cada 30s a 1min) enquanto há campanhas em envio.

### Configurar cron no Cloudflare Workers (produção)

Em `apps/worker/wrangler.toml`, descomente:
```toml
[triggers]
crons = ["* * * * *"]
```

O cron chama `processQueueBatch` a cada minuto automaticamente.

### Limites de envio

Cada servidor tem limites por minuto, hora, dia e mês configuráveis. Quando o limite mensal é atingido, a campanha é **pausada** automaticamente com o motivo no campo `paused_reason`.

| Modo | Lote | Intervalo | Máx/hora | Máx/dia |
|---|---|---|---|---|
| safe | 150 | 20 min | 450 | 1.000 |
| normal | 250 | 15 min | 1.000 | 2.000 |
| fast | 500 | 10 min | 2.000 | 4.000 |
| custom | definido manualmente | — | — | — |

### Processamento de HTML

1. **Sanitize**: remove `<script>`, `<iframe>`, `<form>`, `<object>`, `<embed>` e event handlers (`on*`)
2. **Variáveis**: substitui `{{first_name}}`, `{{last_name}}`, `{{email}}`, `{{client_name}}`, `{{unsubscribe_url}}`, `{{current_date}}`
3. **Descadastro obrigatório**: se `{{unsubscribe_url}}` não estiver no HTML, um rodapé de descadastro é inserido automaticamente antes de `</body>`
4. **Rastreamento de links**: `<a href="...">` são reescritos para `/click/{recipientToken}/{linkId}` (Sprint 4 registra o clique)

### APP_URL (descadastro e rastreamento)

Adicione ao `apps/worker/.dev.vars`:
```
APP_URL=http://localhost:5173
```

Em produção, configure via `wrangler secret put APP_URL`.

---

---

## Deploy — Cloudflare Pages + Workers

### Variáveis de ambiente

**Cloudflare Pages** (frontend) — configure em Settings → Environment Variables:
```
VITE_SUPABASE_URL      = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY = eyJ...   (anon/public key do Supabase)
VITE_WORKER_URL        = https://alvowebmkt-worker.<conta>.workers.dev
```

**Cloudflare Workers** (backend) — configure via `wrangler secret put <VAR>` ou no dashboard:
```
SUPABASE_URL           = https://xxxx.supabase.co
SUPABASE_SERVICE_KEY   = eyJ...   (service_role key — nunca expor no frontend)
SUPABASE_JWT_SECRET    = (Settings → API → JWT Settings)
ENCRYPTION_KEY         = (openssl rand -hex 32)
APP_URL                = https://alvowebmkt.pages.dev
CRON_SECRET            = (string segura aleatória)
MAILEROO_BODY_MODE     = formdata
```

### Deploy do Worker

```bash
cd apps/worker
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put APP_URL
npx wrangler secret put CRON_SECRET
npx wrangler secret put MAILEROO_BODY_MODE
npm run deploy
```

### Deploy do Frontend (Cloudflare Pages)

No Cloudflare Pages, configure:
- **Framework preset**: Vite
- **Build command**: `npm run build -w apps/web`
- **Build output**: `apps/web/dist`
- **Root directory**: `/`

Ou via CLI:
```bash
npx wrangler pages deploy apps/web/dist --project-name alvowebmkt
```

### Cron Trigger (processamento automático)

Em `apps/worker/wrangler.toml`, descomente:
```toml
[triggers]
crons = ["*/5 * * * *"]
```

O Worker executará `runScheduler` a cada 5 minutos automaticamente:
- Enfileira campanhas agendadas vencidas
- Processa a fila de envio

### Testar após deploy

```bash
# Health check (público)
curl https://alvowebmkt-worker.<conta>.workers.dev/health

# Processar fila manualmente
curl -X POST https://.../internal/queue/process \
  -H "X-Cron-Secret: <CRON_SECRET>"

# Executar agendador manualmente
curl -X POST https://.../internal/scheduler/run \
  -H "X-Cron-Secret: <CRON_SECRET>"
```

---

## Sprint 3.5 – Implementado

- [x] Agendamento de campanhas com `scheduled_at` e modo "Agendar envio"
- [x] Calendário mensal de campanhas (`/calendar`)
- [x] Agendador automático: processa campanhas vencidas → prepare → queue
- [x] `POST /api/scheduler/run` e `POST /internal/scheduler/run`
- [x] `GET /health` público e `GET /api/diagnostics` autenticado
- [x] Página de Configurações com botão "Executar agendador agora"
- [x] Exclusão segura: draft/scheduled/completed/failed/cancelled = simples; queued/sending/paused = confirmação "CANCELAR E APAGAR"
- [x] Verificação de itens `processing` antes de apagar
- [x] Duplicar campanha
- [x] Botão "Processar fila agora" na tela de detalhes
- [x] Seção de stats da fila (pending/processing/sent/failed/skipped)
- [x] Menu lateral reorganizado + Calendário + Configurações
- [x] wrangler.toml com cron trigger comentado (pronto para produção)
- [x] README com guia completo de deploy Cloudflare

---

---

## Sprint 5 – Implementado

- [x] `GET /api/campaigns/:id/report` — dados consolidados no Worker
- [x] Gerador automático de resumo executivo, diagnóstico técnico e recomendações
- [x] Página `/campaigns/:id/report` com layout de relatório profissional
- [x] Funil da campanha (CSS bars)
- [x] Evolução temporal (SVG bars por hora)
- [x] Links mais clicados com cliques totais e únicos
- [x] CSS de impressão (`@media print`) para salvar como PDF A4
- [x] Sidebar oculta na impressão (`print:hidden`)
- [x] Botão "Relatório" no detalhe da campanha e na listagem
- [x] Suporte a relatório parcial (campanha em andamento)

---

## Relatório de Campanha

### Como acessar

1. Acesse `/campaigns/:id` e clique em **Relatório**
2. Ou acesse diretamente `/campaigns/:id/report`

### Como salvar em PDF

1. Abra o relatório no browser
2. Clique em **Imprimir / Salvar PDF**
3. No diálogo de impressão, selecione "Salvar como PDF" como destino
4. Recomendado: papel A4, margens padrão, escala 100%

### O que cada métrica significa

| Métrica | Fórmula | Significado |
|---|---|---|
| Taxa de entrega | delivered / sent | E-mails aceitos pelo servidor destino |
| Taxa de abertura | opened / delivered | Aberturas únicas (pixel carregado) |
| Taxa de cliques | clicked / delivered | Cliques únicos em qualquer link |
| CTOR | clicked / opened | Cliques entre quem abriu |
| Bounce rate | bounced / sent | Rejeições definitivas |
| Soft bounce rate | soft_bounced / sent | Falhas temporárias |
| Unsubscribe rate | unsubscribed / delivered | Descadastros |
| Complaint rate | complained / delivered | Marcações como spam |

### Aberturas únicas vs totais

- **Únicas** = contatos que abriram ao menos uma vez (usado para taxas)
- **Totais** = soma de todas as aberturas incluindo re-aberturas

### Cliques únicos vs totais

- **Únicos** = contatos que clicaram ao menos uma vez
- **Totais** = soma de todos os cliques incluindo re-cliques

### Limitações da métrica de abertura

A taxa de abertura é uma **estimativa**, pois:
- **Apple Mail Privacy Protection** pré-carrega imagens, inflando aberturas
- Provedores corporativos e firewalls podem pré-carregar ou bloquear imagens
- Clientes de e-mail com imagens desabilitadas não registram abertura

Use cliques como métrica primária de engajamento.

### Bounce vs Soft bounce vs Blocked policy vs Rejected

| Tipo | Causa | Ação automática |
|---|---|---|
| **Hard bounce** | Endereço inválido, domínio inexistente | Adicionado à suppression list |
| **Soft bounce** | Caixa cheia, servidor temporário | Sem suppression imediata; 3 soft bounces = suppression |
| **Blocked policy** | Filtro corporativo, conteúdo sinalizado | Nenhuma ação automática |
| **Rejected** | Rejeição genérica do servidor | Nenhuma ação automática |
| **Complaint** | Marcado como spam pelo usuário | Adicionado à suppression list |

---

## Sprint 6 – Próximos passos

- Templates de e-mail reutilizáveis
- Configurações por cliente (domínios verificados, limites)
- Agendamento recorrente de campanhas
- API pública para integração
