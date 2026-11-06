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

## Persistência do login dos alunos — 2026-11-05

- Cada login recebe uma sessão independente no banco. Para alunos, a validade é renovada
  durante uso autenticado até 30 dias após o último período de atividade, com limite
  absoluto de 365 dias para o JWT e cookie. Após a inatividade ou o limite, é preciso entrar.
- O cookie não é reemitido nas navegações: uma resposta atrasada não restaura o login
  após sair nem substitui o cookie de um login posterior.
- Sessões antigas permanecem válidas até sua expiração original e são identificadas por
  hash do token, permitindo revogar cada uma sem guardar o token. Não são estendidas.
- Gestor, Secretaria e Professor continuam com validade fixa de 7 dias.
- O proxy preserva a versão original da sessão. Conta inativa, recuperação de senha e
  restrições de matrícula continuam sendo verificadas na DAL/API; renovação não concede acesso.
- Sair revoga apenas a sessão do dispositivo e remove o cookie; as demais continuam ativas.
  A recuperação de senha continua invalidando todas pela versão. Não há senha ou token em localStorage.
