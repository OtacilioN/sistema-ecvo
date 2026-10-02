ALTER TABLE "Plano" ADD COLUMN "familia" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MatriculaFamilia" (
  "id" TEXT NOT NULL,
  "tokenAcompanhamento" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "titularSolicitacaoId" TEXT,
  CONSTRAINT "MatriculaFamilia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatriculaFamilia_tokenAcompanhamento_key"
  ON "MatriculaFamilia"("tokenAcompanhamento");
CREATE UNIQUE INDEX "MatriculaFamilia_titularSolicitacaoId_key"
  ON "MatriculaFamilia"("titularSolicitacaoId");
ALTER TABLE "MatriculaFamilia" ADD CONSTRAINT "MatriculaFamilia_titularSolicitacaoId_fkey"
  FOREIGN KEY ("titularSolicitacaoId") REFERENCES "SolicitacaoMatricula"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SolicitacaoMatricula" ADD COLUMN "matriculaFamiliaId" TEXT;
CREATE INDEX "SolicitacaoMatricula_matriculaFamiliaId_idx"
  ON "SolicitacaoMatricula"("matriculaFamiliaId");
ALTER TABLE "SolicitacaoMatricula" ADD CONSTRAINT "SolicitacaoMatricula_matriculaFamiliaId_fkey"
  FOREIGN KEY ("matriculaFamiliaId") REFERENCES "MatriculaFamilia"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CobrancaAsaas" ADD COLUMN "cobrancaFamiliaId" TEXT;
CREATE INDEX "CobrancaAsaas_cobrancaFamiliaId_idx" ON "CobrancaAsaas"("cobrancaFamiliaId");
ALTER TABLE "CobrancaAsaas" ADD CONSTRAINT "CobrancaAsaas_cobrancaFamiliaId_fkey"
  FOREIGN KEY ("cobrancaFamiliaId") REFERENCES "CobrancaMatriculaAsaas"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Associa apenas o nome unitário informado, preservando planos de várias modalidades.
DO $$
DECLARE
  quantidade INTEGER;
  plano_id TEXT;
BEGIN
  SELECT count(*), min("id") INTO quantidade, plano_id FROM "Plano"
  WHERE translate(lower(trim("nome")), 'áàâãéêíóôõúç', 'aaaaeeiooouc')
    = 'valor unitario plano familia';
  IF quantidade > 1 THEN
    RAISE EXCEPTION 'Há mais de um plano Valor unitario plano familia; revise antes de migrar';
  END IF;
  IF quantidade = 1 THEN
    IF EXISTS (SELECT 1 FROM "Plano" WHERE "id" = plano_id
      AND ("valor" <> 90 OR "periodicidade" <> 'MENSAL')) THEN
      RAISE EXCEPTION 'O plano unitário família existente deve ser mensal e ter valor R$ 90';
    END IF;
    UPDATE "Plano" SET "familia" = true, "ativo" = true,
      "quantidadeModalidadesMatricula" = NULL, "padrao" = false,
      "atualizadoEm" = CURRENT_TIMESTAMP WHERE "id" = plano_id;
  ELSE
    INSERT INTO "Plano" ("id", "nome", "valor", "periodicidade", "ativo", "padrao",
      "familia", "quantidadeModalidadesMatricula", "atualizadoEm")
    VALUES ('plano-familia-unitario-20261002', 'Valor unitario plano familia', 90,
      'MENSAL', true, false, true, NULL, CURRENT_TIMESTAMP);
  END IF;
END $$;

CREATE UNIQUE INDEX "Plano_familia_ativo_mensal_key" ON "Plano"("familia")
  WHERE "familia" = true AND "ativo" = true AND "periodicidade" = 'MENSAL';
