CREATE TABLE "ExclusaoRepasseExternoMensal" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "plataforma" "Plataforma" NOT NULL,
    "alunoId" TEXT NOT NULL,
    "modalidadeId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExclusaoRepasseExternoMensal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExclusaoRepasseExternoMensal_competencia_check"
      CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left("competencia", 4) <> '0000'),
    CONSTRAINT "ExclusaoRepasseExternoMensal_plataforma_check"
      CHECK ("plataforma" IN ('WELLHUB', 'TOTALPASS')),
    CONSTRAINT "ExclusaoRepasseExternoMensal_justificativa_check"
      CHECK (length(trim("justificativa")) BETWEEN 1 AND 2000)
);

CREATE UNIQUE INDEX "ExclusaoRepasseExternoMensal_escopo_key"
  ON "ExclusaoRepasseExternoMensal"("competencia", "plataforma", "alunoId", "modalidadeId", "professorId");
CREATE INDEX "ExclusaoRepasseExternoMensal_alunoId_idx" ON "ExclusaoRepasseExternoMensal"("alunoId");
CREATE INDEX "ExclusaoRepasseExternoMensal_modalidadeId_idx" ON "ExclusaoRepasseExternoMensal"("modalidadeId");
CREATE INDEX "ExclusaoRepasseExternoMensal_professorId_idx" ON "ExclusaoRepasseExternoMensal"("professorId");
CREATE INDEX "ExclusaoRepasseExternoMensal_criadoPorId_idx" ON "ExclusaoRepasseExternoMensal"("criadoPorId");

ALTER TABLE "ExclusaoRepasseExternoMensal" ADD CONSTRAINT "ExclusaoRepasseExternoMensal_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExclusaoRepasseExternoMensal" ADD CONSTRAINT "ExclusaoRepasseExternoMensal_modalidadeId_fkey"
  FOREIGN KEY ("modalidadeId") REFERENCES "Modalidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExclusaoRepasseExternoMensal" ADD CONSTRAINT "ExclusaoRepasseExternoMensal_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExclusaoRepasseExternoMensal" ADD CONSTRAINT "ExclusaoRepasseExternoMensal_criadoPorId_fkey"
  FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
