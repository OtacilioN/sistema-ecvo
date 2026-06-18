ALTER TYPE "TipoAcaoAudit" ADD VALUE IF NOT EXISTS 'TERMO_RESPONSABILIDADE_ACEITO';

CREATE TABLE "AceiteTermoResponsabilidade" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "termoVersao" TEXT NOT NULL,
  "nomeAluno" TEXT NOT NULL,
  "cpfAluno" TEXT,
  "cidade" TEXT NOT NULL,
  "menorDeIdade" BOOLEAN NOT NULL DEFAULT false,
  "declaracoesAceitas" JSONB NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "metadados" JSONB,
  "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceiteTermoResponsabilidade_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AceiteTermoResponsabilidade_alunoId_termoVersao_key" ON "AceiteTermoResponsabilidade"("alunoId", "termoVersao");
CREATE INDEX "AceiteTermoResponsabilidade_termoVersao_idx" ON "AceiteTermoResponsabilidade"("termoVersao");
CREATE INDEX "AceiteTermoResponsabilidade_aceitoEm_idx" ON "AceiteTermoResponsabilidade"("aceitoEm");

ALTER TABLE "AceiteTermoResponsabilidade"
  ADD CONSTRAINT "AceiteTermoResponsabilidade_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
