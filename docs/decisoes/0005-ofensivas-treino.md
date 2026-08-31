# 0005 — Ofensivas de treino por modalidade

## Status

Aceita.

## Contexto

A ECVO quer incentivar regularidade sem punir alunos quando uma modalidade não funcionou em determinado
dia. O mesmo aluno também pode praticar várias modalidades com calendários independentes.

## Decisão

- A ofensiva é mantida por `Aluno + Modalidade`.
- Ela mede dias civis inclusivos entre o primeiro e o último treino da sequência, e não quantidade de
  sessões. Assim, segunda, quarta, sexta e segunda seguinte produzem 1, 3, 5 e 8 dias.
- A fonte de verdade é o check-in válido. A data vem de `Aula.inicio` no fuso `America/Sao_Paulo`; a
  modalidade vem do crédito de horas, que preserva o contexto histórico mesmo se uma turma for editada.
- Um dia entra no calendário da modalidade somente quando existe ao menos um check-in válido. Se ninguém
  treinou, o dia é neutro para todos.
- A falta é consolidada somente depois do fim do dia. Isso impede que o primeiro check-in da manhã quebre
  temporariamente a ofensiva de um aluno que ainda treinará à noite.
- `OfensivaTreino` é um resumo materializado e recalculável, com ofensiva atual e máxima histórica. Check-in,
  invalidação e uma tarefa diária idempotente mantêm o resumo sincronizado.
- O ciclo vigente do ranking começa em 31/08/2026. O histórico anterior permanece íntegro para presença
  e horas, mas não participa dos dias ativos, sequências ou recordes do ranking.
- Correções retroativas recalculam também a máxima: uma presença invalidada não sustenta um recorde.
- Todos os rankings usam a maior ofensiva histórica. No ranking geral vale o maior recorde do aluno entre
  suas modalidades. Não somamos modalidades, para não favorecer artificialmente alunos multimodais.
  Ranking por modalidade inclui somente alunos operacionais atualmente vinculados a ela.
- Quebrar a ofensiva atual não reduz a posição conquistada pelo recorde histórico. Recordes iguais
  compartilham posição. A interface do aluno usa primeiro nome e inicial
  do último sobrenome, sem fotografia, reduzindo a exposição de dados pessoais.

## Consequências

O cálculo pode ser reconstruído integralmente a partir dos check-ins e créditos de horas. A sincronização
por modalidade é mais cara que um incremento cego, mas corrige invalidações, registros retroativos e dias
que deixam de ser ativos, preservando consistência para o tamanho atual da academia.
