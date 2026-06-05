ALTER TABLE "ConfiguracaoAcademia"
ADD COLUMN "valorBaseModalidade" DECIMAL(10, 2) NOT NULL DEFAULT 100.00;

ALTER TABLE "RegistroImportado"
ADD COLUMN "valorRepasse" DECIMAL(10, 2);
