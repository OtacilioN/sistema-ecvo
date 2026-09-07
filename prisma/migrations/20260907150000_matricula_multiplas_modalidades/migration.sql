ALTER TABLE "Plano"
  ADD COLUMN "quantidadeModalidadesMatricula" INTEGER;

UPDATE "Plano"
SET "quantidadeModalidadesMatricula" = CASE "id"
  WHEN 'plano-1-modalidade-de-luta' THEN 1
  WHEN 'plano-2-modalidades-de-luta' THEN 2
  WHEN 'plano-3-modalidades-de-luta' THEN 3
END
WHERE "id" IN (
  'plano-1-modalidade-de-luta',
  'plano-2-modalidades-de-luta',
  'plano-3-modalidades-de-luta'
);

ALTER TABLE "Plano"
  ADD CONSTRAINT "Plano_quantidadeModalidadesMatricula_check"
  CHECK (
    "quantidadeModalidadesMatricula" IS NULL
    OR "quantidadeModalidadesMatricula" BETWEEN 1 AND 3
  );

CREATE UNIQUE INDEX "Plano_quantidadeModalidadesMatricula_ativo_key"
  ON "Plano"("quantidadeModalidadesMatricula")
  WHERE "quantidadeModalidadesMatricula" IS NOT NULL;

CREATE TABLE "SolicitacaoMatriculaModalidade" (
  "solicitacaoId" TEXT NOT NULL,
  "modalidadeId" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SolicitacaoMatriculaModalidade_pkey" PRIMARY KEY ("solicitacaoId", "modalidadeId")
);

CREATE INDEX "SolicitacaoMatriculaModalidade_modalidadeId_idx"
  ON "SolicitacaoMatriculaModalidade"("modalidadeId");

ALTER TABLE "SolicitacaoMatriculaModalidade"
  ADD CONSTRAINT "SolicitacaoMatriculaModalidade_solicitacaoId_fkey"
  FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoMatricula"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SolicitacaoMatriculaModalidade_modalidadeId_fkey"
  FOREIGN KEY ("modalidadeId") REFERENCES "Modalidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "SolicitacaoMatriculaModalidade" ("solicitacaoId", "modalidadeId", "criadoEm")
SELECT "id", "modalidadeId", "criadoEm"
FROM "SolicitacaoMatricula"
ON CONFLICT ("solicitacaoId", "modalidadeId") DO NOTHING;
