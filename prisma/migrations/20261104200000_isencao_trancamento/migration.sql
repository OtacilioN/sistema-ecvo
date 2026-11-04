CREATE TABLE "OperacaoIsencaoTrancamento" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "autorId" TEXT,
  "mensalidadeIds" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "leaseToken" TEXT,
  "leaseAte" TIMESTAMP(3),
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "ultimoErro" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  "concluidoEm" TIMESTAMP(3),
  CONSTRAINT "OperacaoIsencaoTrancamento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperacaoIsencaoTrancamento_status_check" CHECK ("status" IN ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA')),
  CONSTRAINT "OperacaoIsencaoTrancamento_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OperacaoIsencaoTrancamento_status_leaseAte_criadoEm_idx" ON "OperacaoIsencaoTrancamento"("status", "leaseAte", "criadoEm");
CREATE INDEX "OperacaoIsencaoTrancamento_alunoId_status_idx" ON "OperacaoIsencaoTrancamento"("alunoId", "status");
CREATE UNIQUE INDEX "OperacaoIsencaoTrancamento_ativa_aluno_idx" ON "OperacaoIsencaoTrancamento"("alunoId") WHERE "status" IN ('PENDENTE', 'PROCESSANDO');
