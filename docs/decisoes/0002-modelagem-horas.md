# ADR 0002 — Modelagem de horas como livro-razão (ledger)

**Status:** aceito · **Data:** 2026-06-04

## Contexto
As horas treinadas são o diferencial do produto (jornada das 10 mil horas) e precisam ser **auditáveis** e
**reversíveis**: um check-in válido gera horas; invalidá-lo deve estornar exatamente aquelas horas, sem
corromper o histórico (RF-030/035, RN-005, CA-007/008).

## Decisão
Modelar horas como um **livro-razão append-only** (`MovimentoHoras`), em vez de um contador mutável:
- `CREDITO` (minutos > 0) ao check-in válido, ligado ao `checkinId` e à `modalidadeId`;
- `ESTORNO` (minutos < 0) ao invalidar/excluir, com `estornaMovimentoId` apontando o crédito;
- `AJUSTE_MANUAL` para correções do gestor (com `autorId` e `motivo`).
Totais são sempre `SUM(minutos)`. **Presença** não é tabela: é a existência de um `Checkin` válido.

Toda invalidação ocorre em **uma transação** que: marca `Checkin.status`, insere o `ESTORNO` e grava
`LogAuditoria`.

## Alternativas descartadas
- **Contador mutável em `Aluno`**: simples de ler, mas perde histórico, dificulta auditoria e é propenso a
  divergências em concorrência.
- **Tabela `Presenca` própria**: estado redundante com `Checkin`; risco de inconsistência.

## Consequências
- Leituras de total exigem agregação (`SUM`) — barato com índices em `alunoId`/`modalidadeId`; pode-se
  materializar cache depois, se necessário.
- Marcos (10..10.000h) são derivados do total no momento da exibição/notificação.
