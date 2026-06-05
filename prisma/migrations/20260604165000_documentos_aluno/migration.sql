ALTER TYPE "TipoAcaoAudit" ADD VALUE 'DOCUMENTO_ALUNO_ADICIONADO';

CREATE TABLE "DocumentoAluno" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "categoria" TEXT,
    "url" TEXT NOT NULL,
    "observacao" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoAluno_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentoAluno_alunoId_idx" ON "DocumentoAluno"("alunoId");

ALTER TABLE "DocumentoAluno" ADD CONSTRAINT "DocumentoAluno_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
