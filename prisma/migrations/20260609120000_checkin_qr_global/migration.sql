ALTER TYPE "TipoAcaoAudit" ADD VALUE IF NOT EXISTS 'CHECKIN_BLOQUEADO_INADIMPLENCIA';

CREATE TABLE "TokenCheckinAcademia" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "token" TEXT NOT NULL,
  "rotacionadoPorId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TokenCheckinAcademia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TokenCheckinAcademia_token_key" ON "TokenCheckinAcademia"("token");

CREATE TABLE "TentativaCheckinInadimplente" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "aulaId" TEXT NOT NULL,
  "motivo" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TentativaCheckinInadimplente_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TentativaCheckinInadimplente_aulaId_criadoEm_idx"
  ON "TentativaCheckinInadimplente"("aulaId", "criadoEm");

CREATE INDEX "TentativaCheckinInadimplente_alunoId_criadoEm_idx"
  ON "TentativaCheckinInadimplente"("alunoId", "criadoEm");

ALTER TABLE "TentativaCheckinInadimplente"
ADD CONSTRAINT "TentativaCheckinInadimplente_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TentativaCheckinInadimplente"
ADD CONSTRAINT "TentativaCheckinInadimplente_aulaId_fkey"
FOREIGN KEY ("aulaId") REFERENCES "Aula"("id") ON DELETE CASCADE ON UPDATE CASCADE;
