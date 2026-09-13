ALTER TABLE "Importacao"
  ADD COLUMN "competencia" TEXT,
  ADD COLUMN "resumoMensal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "unidadeExternaId" TEXT,
  ADD COLUMN "unidadeExternaNome" TEXT;

ALTER TABLE "RegistroImportado"
  ADD COLUMN "idExterno" TEXT,
  ADD COLUMN "totalCheckins" INTEGER;

CREATE UNIQUE INDEX "Importacao_plataforma_competencia_unidadeExternaId_key"
  ON "Importacao"("plataforma", "competencia", "unidadeExternaId");
CREATE INDEX "Importacao_competencia_idx" ON "Importacao"("competencia");

ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_resumo_mensal_check"
  CHECK (NOT "resumoMensal" OR (
    "plataforma" = 'WELLHUB' AND
    "competencia" IS NOT NULL AND "competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND
    "unidadeExternaId" IS NOT NULL AND length(trim("unidadeExternaId")) > 0
  ));
ALTER TABLE "RegistroImportado" ADD CONSTRAINT "RegistroImportado_total_checkins_check"
  CHECK ("totalCheckins" IS NULL OR "totalCheckins" >= 0);
