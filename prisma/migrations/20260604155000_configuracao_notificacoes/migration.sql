ALTER TABLE "ConfiguracaoAcademia"
ADD COLUMN "notificarComparecimento" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notificarLembreteTreino" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notificarCancelamentoAula" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notificarFinanceiro" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notificarGraduacao" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notificarCheckinInvalidado" BOOLEAN NOT NULL DEFAULT true;
