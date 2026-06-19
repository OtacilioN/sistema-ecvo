ALTER TYPE "TipoNotificacao" ADD VALUE IF NOT EXISTS 'LEMBRETE_AGENDAMENTO';

ALTER TABLE "ConfiguracaoAcademia"
ADD COLUMN "notificarLembreteAgendamento" BOOLEAN NOT NULL DEFAULT true;
