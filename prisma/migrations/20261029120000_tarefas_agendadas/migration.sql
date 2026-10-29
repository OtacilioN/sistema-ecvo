CREATE TYPE "StatusExecucaoTarefaAgendada" AS ENUM ('EM_EXECUCAO', 'CONCLUIDA', 'FALHOU', 'INTERROMPIDA');

ALTER TYPE "TipoNotificacao" ADD VALUE 'TAREFA_AGENDADA';

CREATE TABLE "ControleTarefaAgendada" (
    "tarefa" TEXT NOT NULL,
    "execucaoAtualId" TEXT,
    "leaseAte" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaExecucaoEm" TIMESTAMP(3),
    "ultimaConclusaoEm" TIMESTAMP(3),
    "ultimoSucessoEm" TIMESTAMP(3),
    "ultimaFalhaEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ControleTarefaAgendada_pkey" PRIMARY KEY ("tarefa"),
    CONSTRAINT "ControleTarefaAgendada_lease_check" CHECK (
        ("execucaoAtualId" IS NULL AND "leaseAte" IS NULL) OR
        ("execucaoAtualId" IS NOT NULL AND "leaseAte" IS NOT NULL)
    )
);

CREATE TABLE "ExecucaoTarefaAgendada" (
    "id" TEXT NOT NULL,
    "tarefa" TEXT NOT NULL,
    "status" "StatusExecucaoTarefaAgendada" NOT NULL DEFAULT 'EM_EXECUCAO',
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),
    "duracaoMs" INTEGER,
    "contadores" JSONB,
    "erroSeguro" TEXT,
    CONSTRAINT "ExecucaoTarefaAgendada_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExecucaoTarefaAgendada_duracao_check" CHECK ("duracaoMs" IS NULL OR "duracaoMs" >= 0),
    CONSTRAINT "ExecucaoTarefaAgendada_tarefa_fkey" FOREIGN KEY ("tarefa") REFERENCES "ControleTarefaAgendada"("tarefa") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ExecucaoTarefaAgendada_tarefa_iniciadoEm_idx" ON "ExecucaoTarefaAgendada"("tarefa", "iniciadoEm");
CREATE INDEX "ExecucaoTarefaAgendada_concluidoEm_idx" ON "ExecucaoTarefaAgendada"("concluidoEm");
