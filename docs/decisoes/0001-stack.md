# ADR 0001 — Stack tecnológica

**Status:** aceito · **Data:** 2026-06-04

## Contexto
Web app de gestão para a ECVO, hospedável na Vercel, com modelo de dados relacional rico (~19 entidades) e
forte ênfase em integridade (cadeia check-in → presença → horas → estorno) e auditoria.

## Decisão
- **Next.js 16 (App Router) + TypeScript strict + React 19.** Requisito do projeto; Server Components +
  Server Actions encaixam num app CRUD com RBAC no servidor.
- **PostgreSQL na Neon + Prisma.** Postgres pela integridade referencial e transações; Neon pelo modelo
  serverless e branch de banco por preview deploy na Vercel. Prisma porque o `schema.prisma` é o artefato
  mais legível por agentes e dá type-safety ponta a ponta.
- **Tailwind CSS v4 + componentes shadcn-style** (copiados em `src/components/ui`, sem caixa-preta).
- **zod v4 + react-hook-form** para validação compartilhada cliente/servidor.
- **Biome** (lint+format num comando) em vez de ESLint+Prettier — `next lint` foi removido no Next 16.
- **Vitest** (regras de domínio) + **Playwright** (E2E mobile dos fluxos críticos).

## Consequências
- Build e dev usam Turbopack (padrão no Next 16).
- Migrations versionadas em `prisma/migrations`; deploy com `prisma migrate deploy`.
- Componentes de UI são mantidos no repositório (podemos depois rodar `shadcn` para acrescentar mais).
