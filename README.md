# ECVO — Sistema de Gestão (Escola de Combate)

Web app em **Next.js 16** para gerenciar a operação da ECVO: alunos, professores, modalidades, grade de
treinos, **comparecimento → check-in → presença → horas treinadas**, graduações, financeiro e conciliação
de alunos Wellhub/TotalPass. Hospedável na **Vercel**.

> 🤖 Projeto **agentic-friendly**: agentes (Claude, Codex, etc.) devem ler **[`AGENTS.md`](./AGENTS.md)**
> antes de codar. Requisitos em [`docs/requisitos.md`](./docs/requisitos.md).

## Stack

Next.js 16 (App Router) · TypeScript · React 19 · PostgreSQL (Neon) + Prisma · Tailwind CSS v4 ·
autenticação própria (jose + bcrypt + DAL) · zod · Biome · Vitest · Playwright.

## Começando

1. **Instale as dependências**

   ```bash
   npm install
   ```

2. **Configure o ambiente** — copie `.env.example` para `.env` e preencha:

   ```bash
   cp .env.example .env
   # DATABASE_URL / DIRECT_URL: conexões da Neon (https://neon.tech)
   # SESSION_SECRET: openssl rand -base64 32
   # CRON_SECRET: openssl rand -base64 32
   ```

3. **Crie o schema e popule dados de demonstração**

   ```bash
   npm run db:deploy   # aplica a migration inicial (prisma/migrations)
   npm run db:seed     # cria usuários e dados de exemplo
   ```

   > Em desenvolvimento, alternativamente use `npm run db:push` para sincronizar o schema sem migrations.

4. **Rode o app**

   ```bash
   npm run dev
   ```

   Acesse http://localhost:3000.

### Usuários de demonstração (após `db:seed`)

| Papel     | E-mail               | Senha     |
| --------- | -------------------- | --------- |
| Gestor    | gestor@ecvo.com.br   | `ecvo123` |
| Professor | professor@ecvo.com.br | `ecvo123` |
| Aluno     | aluno@ecvo.com.br     | `ecvo123` |
| Aluno     | wellhub@ecvo.com.br   | `ecvo123` |

## Scripts

`dev` · `build` · `start` · `lint` · `format` · `typecheck` · `test` · `test:e2e` ·
`db:migrate` · `db:deploy` · `db:push` · `db:seed` · `db:studio`.

## Deploy na Vercel

1. Conecte o repositório à Vercel e adicione a integração **Neon** (cria um banco por preview deploy).
2. Defina as variáveis de ambiente: `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `CRON_SECRET`.
3. O `build` roda `prisma generate`; aplique migrations com `prisma migrate deploy`
   (via Build Command `npm run db:deploy && npm run build` ou um passo de CI).
4. O Vercel Cron chama `/api/tarefas/gerar-aulas-futuras` diariamente às 06:00 UTC
   para manter oito semanas de aulas recorrentes futuras geradas, e
   `/api/tarefas/lembretes-diarios` às 11:00 UTC para notificar gestores sobre
   mensalidades a vencer/inadimplentes, além de gestores e professores sobre
   aniversários de alunos.
5. `main` → produção; cada PR → preview com banco isolado.

## Documentação

- [`AGENTS.md`](./AGENTS.md) — guia para agentes e convenções do projeto.
- [`docs/requisitos.md`](./docs/requisitos.md) — requisitos (RF/RN/CA/RNF).
- [`docs/glossario.md`](./docs/glossario.md) — glossário do domínio.
- [`docs/modelo-dados.md`](./docs/modelo-dados.md) — modelo de dados (ER).
- [`docs/rastreabilidade.md`](./docs/rastreabilidade.md) — requisito ↔ entidade ↔ código.
- [`docs/decisoes/`](./docs/decisoes/) — registros de decisão (ADRs).
