# Tarefas automáticas no Vercel Pro

Data: 29/10/2026. Escopo: implementação local das prioridades 1–4 do plano de adoção do Pro.

## Decisão

- Treino: cron a cada 15 minutos, independente de navegador aberto. Janela normal de 60–75 minutos antes da aula, com recuperação até antes do início. Paginação de comparecimentos em lotes de 200 e chave única por usuário/aula; notificações legadas também são reconhecidas. Push ocorre depois da persistência, sem transação aberta.
- Asaas: recuperação horária de exceções antigas e revisão gradual de cobranças pendentes/vencidas ativas com ID remoto sem atualização há seis horas, até 25 cobranças e 25 autorizações por rodada. Orçamento de 90 segundos entre itens; exceções respeitam cooldown de 15 minutos. A revisão gradual permite recuperar webhooks perdidos sem varrer todas as pendências a cada hora; a latência depende do cooldown e da fila do lote. Contratos ativos e a revisão ampla continuam diários. Webhook é o canal primário; recuperação não cria ou reemite cobranças. A revisão diária e a recuperação compartilham a reserva `reconciliar-asaas`.
- Às 00h05, atualizar preços locais e vencimentos sem avisar alunos. Às 08h, gerar mensalidades e avisos financeiros em etapas independentes. A geração permanece de manhã porque já envia o aviso de nova mensalidade. Alunos que pagarem entre manutenção e comunicação ficam fora da consulta de avisos de atraso.
- Aniversários e aluguel permanecem às 08h, isolados do financeiro. Aluguel continua somente no dia 15, por gestor/mês. Aulas futuras, ofensivas e convite para amanhã mantêm frequência diária. Limpeza tem tarefa própria.
- Todos os handlers agendados exigem `CRON_SECRET`, não permitem cache e têm `maxDuration=300`. A reserva persistente dura 360 segundos, acima do limite de execução, e não mantém conexão durante o trabalho. Retorno 202 indica reserva ocupada; falha de infraestrutura impede executar sem histórico.
- Histórico em `ControleTarefaAgendada`/`ExecucaoTarefaAgendada`: início, fim, duração, resultado e somente contagens permitidas. Não guardar resultados brutos, valores financeiros, IDs de alunos, payloads ou erros com credenciais. Uma execução interrompida é marcada na próxima aquisição; o token da execução impede liberar a reserva de outra instância.
- Tela exclusiva de gestor: `/gestao/configuracoes/tarefas`. Exibe saúde e últimas 50 execuções, com retenção de 30 dias. O monitor horário inicia controles ainda ausentes e avisa gestores quando não há sucesso por 45 minutos (treino), 150 minutos (rotinas horárias) ou 27 horas (diárias). O alerta é deduplicado por tarefa/último sucesso/gestor. Uma falha isolada dentro desse prazo aparece na tela e não gera novo alerta.

Horários operacionais são da academia (`America/Sao_Paulo`, UTC-3); expressões em `vercel.json` são UTC. Registro e cron têm teste de consistência.

## Consumo e publicação

São 12 definições e aproximadamente 4.590 chamadas agendadas por mês de 30 dias, além de 30 registros internos da revisão diária Asaas. Mantida a simulação do plano (2 GB, 10 s de duração, 100 ms de CPU), o compute desses disparos representa aproximadamente US$0,29–0,50/mês em iad1/gru1. Isso não é medição nem inclui tráfego, builds, armazenamento, banco ou outros projetos. Acompanhar Usage e duração real por sete dias após publicar; consultas a cada 15 minutos podem aumentar o tempo ativo do Neon.

A migration `20261029120000_tarefas_agendadas` é aditiva. Aplicar e verificar antes de publicar rotas que usam as tabelas/enum; build Vercel não aplica migrations. Não executar os handlers em produção apenas para testar: eles alteram domínio e podem enviar notificações.

Na publicação, confirmar plano Pro na equipe correta, `CRON_SECRET` já configurado, agendamentos ativos no deployment de produção e sucesso persistido após os horários esperados. Conferir a tela com gestor e a negativa para outros papéis. Conferir Usage antes/depois, memória/região/Fluid Compute reais e alertas de gasto. Nenhuma configuração de faturamento, pausa automática ou add-on pago é alterada por esse código.

Alertas de gasto na Vercel são configuração da equipe, não cron de aplicação: ajustar o orçamento de excedente e suas notificações na etapa de publicação. A fila persistente para reenvio de push é uma fase posterior; esta implementação mantém a entrega best effort existente.

O monitor interno depende do próprio agendador; a tela permite perceber ausência de conclusão do monitor, mas esse mecanismo não substitui monitoramento externo de uma parada global do agendador ou da aplicação.
