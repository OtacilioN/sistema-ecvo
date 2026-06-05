# ADR 0003 — Autenticação própria (sem Auth.js)

**Status:** aceito · **Data:** 2026-06-04

## Contexto
RNF-004 exige autenticação por usuário+senha, controle de sessão e RBAC por papel. O plano inicial previa
Auth.js v5. Porém, o Next.js 16 renomeou `middleware` para `proxy` (runtime nodejs) e a documentação oficial
alerta que bibliotecas de auth dependentes do **edge runtime** podem ser incompatíveis com `proxy`. Auth.js
v5 ainda está em beta e seu acoplamento ao bleeding-edge do Next 16.2 traz risco.

## Decisão
Implementar o **padrão de sessão própria documentado pelo Next.js 16**:
- senha com **bcrypt** (`bcryptjs`, pure-JS, compatível com serverless);
- sessão **JWT assinada (jose)** em cookie **httpOnly/secure/sameSite=lax**, contendo só `id`, `papel`, `nome`;
- **Data Access Layer** (`src/lib/auth/dal.ts`) com `verificarSessao`, `getUsuarioAtual`, `exigirPapel` —
  toda página/Server Action/Route Handler autoriza aqui;
- `src/proxy.ts` faz apenas **redirecionamento otimista** (lê o cookie), nunca é a única defesa.

## Consequências
- Controle total do fluxo e dos dados (bom para LGPD), sem dependência de lib externa em beta.
- Sem login social/MFA prontos — fora do escopo do MVP; se necessário no futuro, reavaliar uma lib.
- Compatível com o runtime nodejs do `proxy` no Next 16.
