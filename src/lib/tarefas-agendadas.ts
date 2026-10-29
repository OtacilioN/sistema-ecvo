// Horários UTC; a academia opera em UTC-3. Não contém callbacks nem segredos.
export const TAREFAS_AGENDADAS = [
  {
    tarefa: "trancar-aulas-avulsas",
    nome: "Encerrar aulas avulsas",
    cron: "0 3 * * *",
    frequencia: "Diariamente, às 00h",
    toleranciaMinutos: 27 * 60,
  },
  {
    tarefa: "manutencao-financeira",
    nome: "Manutenção financeira",
    cron: "5 3 * * *",
    frequencia: "Diariamente, às 00h05",
    toleranciaMinutos: 27 * 60,
  },
  {
    tarefa: "gerar-aulas-futuras",
    nome: "Gerar aulas futuras",
    cron: "0 6 * * *",
    frequencia: "Diariamente, às 03h",
    toleranciaMinutos: 27 * 60,
  },
  {
    tarefa: "sincronizar-ofensivas",
    nome: "Fechar ofensivas de treino",
    cron: "15 6 * * *",
    frequencia: "Diariamente, às 03h15",
    toleranciaMinutos: 27 * 60,
  },
  {
    tarefa: "lembretes-diarios",
    nome: "Lembretes de aniversário e aluguel",
    cron: "0 11 * * *",
    frequencia: "Diariamente, às 08h",
    toleranciaMinutos: 27 * 60,
  },
  {
    tarefa: "lembretes-financeiros",
    nome: "Avisos financeiros",
    cron: "0 11 * * *",
    frequencia: "Diariamente, às 08h",
    toleranciaMinutos: 27 * 60,
  },
  {
    tarefa: "cobrancas-pix-automatico",
    nome: "Revisão diária Asaas e ciclos Pix",
    cron: "0 12 * * *",
    frequencia: "Diariamente, às 09h",
    toleranciaMinutos: 27 * 60,
  },
  {
    tarefa: "lembretes-agendamento-aulas",
    nome: "Convite para agendar amanhã",
    cron: "30 22 * * *",
    frequencia: "Diariamente, às 19h30",
    toleranciaMinutos: 27 * 60,
  },
  {
    tarefa: "lembretes-treino",
    nome: "Lembretes de treino",
    cron: "*/15 * * * *",
    frequencia: "A cada 15 minutos",
    toleranciaMinutos: 45,
  },
  {
    tarefa: "reconciliar-asaas",
    nome: "Recuperar pendências Asaas",
    cron: "10 * * * *",
    frequencia: "A cada hora",
    toleranciaMinutos: 150,
  },
  {
    tarefa: "monitorar-tarefas",
    nome: "Verificar tarefas automáticas",
    cron: "50 * * * *",
    frequencia: "A cada hora",
    toleranciaMinutos: 150,
  },
  {
    tarefa: "limpeza-diaria",
    nome: "Limpar notificações e histórico antigo",
    cron: "45 6 * * *",
    frequencia: "Diariamente, às 03h45",
    toleranciaMinutos: 27 * 60,
  },
] as const

export type NomeTarefaAgendada = (typeof TAREFAS_AGENDADAS)[number]["tarefa"]
