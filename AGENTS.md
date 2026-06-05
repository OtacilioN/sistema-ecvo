<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Sistema ECVO — guia para agentes

Sistema web de gestão da **ECVO**, uma escola de combate (jiu-jitsu, kickboxing, muay thai, boxe etc.).
Papéis: **Gestor**, **Professor**, **Aluno**. Domínio e UI em **português (pt-BR)**. Hospedável na Vercel.

> Requisitos completos: `docs/requisitos.md`. Glossário: `docs/glossario.md`.
> Mapa requisito↔código: `docs/rastreabilidade.md`. Decisões: `docs/decisoes/`.

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript strict** + **React 19**.
- **PostgreSQL (Neon)** + **Prisma** ORM (`prisma/schema.prisma` é a fonte de verdade do modelo).
- **Autenticação própria**: JWT assinado (jose) em cookie httpOnly + bcrypt + **DAL** (`src/lib/auth/dal.ts`).
  Não usamos Auth.js — ver `docs/decisoes/0003-autenticacao.md`.
- **Tailwind CSS v4** (config CSS-first em `src/app/globals.css`) + componentes shadcn-style em `src/components/ui`.
- **zod v4** (validação) + **react-hook-form**. **Biome** (lint/format). **Vitest** + **Playwright** (testes).

## Comandos

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # prisma generate + next build
npm run lint         # biome check
npm run format       # biome format --write
npm run typecheck    # tsc --noEmit
npm run test         # vitest (regras de domínio em src/lib/services)
npm run test:e2e     # playwright (fluxos críticos, mobile-first)
npm run db:migrate   # prisma migrate dev (cria/aplica migration local)
npm run db:deploy    # prisma migrate deploy (produção/Vercel)
npm run db:seed      # popula dados de demonstração
npm run db:studio    # Prisma Studio
```

Variáveis de ambiente: ver `.env.example` (`DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`).

## Convenções

- **Idioma do código**: termos de domínio em **pt-BR** (`Aluno`, `Comparecimento`, `Turma`,
  `horasService.estornar()`); termos técnicos neutros em inglês (`id`, `status`, `createdAt`).
- **Estrutura de rotas** por papel (route groups): `(gestor)/gestao`, `(professor)/professor`,
  `(aluno)/aluno`, `(auth)/login`.
- **Camadas**: páginas/Server Actions → **serviços** (`src/lib/services/*`) → Prisma.
  Leituras simples podem consultar `db` direto em Server Components; **toda mutação de domínio e
  transação passa por um serviço**.
- **Autorização**: cada página/Server Action/Route Handler chama a DAL (`exigirPapel`, `exigirAluno`,
  `exigirProfessor`). O `proxy.ts` faz só redirecionamento otimista — nunca é a única defesa.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`…).

## Regras de domínio invioláveis (núcleo)

1. **Comparecimento ≠ presença** (RN-001). Marcar comparecimento é só intenção; não gera horas.
2. **Check-in válido = presença + horas** (RN-002): gera horas = duração da aula, no total geral e na modalidade.
3. **Invalidar/excluir check-in estorna horas** (RN-005/RF-035): nunca apague horas — lance um
   `MovimentoHoras` de ESTORNO (minutos negativos) na **mesma transação** que grava o `LogAuditoria`.
4. **Sem dupla contagem** (RF-039): a mesma aula nunca conta duas vezes para o mesmo aluno
   (`@@unique([alunoId, aulaId])`).
5. **Nunca graduar automaticamente** (RN-010): critérios apenas sugerem elegibilidade; a decisão é do professor.
6. **Toda ação crítica gera `LogAuditoria`** (RF-079/080) via `auditoria.service.ts`.
7. **LGPD** (RNF-005): dados sensíveis (menores, médicos, financeiros, fotos) só conforme o papel.
