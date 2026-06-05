ALTER TYPE "TipoNotificacao" ADD VALUE IF NOT EXISTS 'ANIVERSARIO';

ALTER TABLE "ConfiguracaoAcademia"
ADD COLUMN "notificarAniversario" BOOLEAN NOT NULL DEFAULT true;
