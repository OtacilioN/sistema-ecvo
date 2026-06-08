CREATE TABLE "AlunoPlanoModalidade" (
  "alunoId" TEXT NOT NULL,
  "modalidadeId" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AlunoPlanoModalidade_pkey" PRIMARY KEY ("alunoId", "modalidadeId")
);

CREATE INDEX "AlunoPlanoModalidade_modalidadeId_idx" ON "AlunoPlanoModalidade"("modalidadeId");

ALTER TABLE "AlunoPlanoModalidade"
ADD CONSTRAINT "AlunoPlanoModalidade_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AlunoPlanoModalidade"
ADD CONSTRAINT "AlunoPlanoModalidade_modalidadeId_fkey"
FOREIGN KEY ("modalidadeId") REFERENCES "Modalidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AlunoPlanoModalidade" ("alunoId", "modalidadeId")
SELECT DISTINCT a."id", am."B"
FROM "Aluno" a
JOIN "_AlunoModalidade" am ON am."A" = a."id"
WHERE a."planoId" IS NOT NULL
ON CONFLICT ("alunoId", "modalidadeId") DO NOTHING;

DROP TABLE IF EXISTS "_PlanoModalidade";
