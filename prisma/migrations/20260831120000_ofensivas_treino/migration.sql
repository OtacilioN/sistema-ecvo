CREATE TABLE "OfensivaTreino" (
    "alunoId" TEXT NOT NULL,
    "modalidadeId" TEXT NOT NULL,
    "diasAtuais" INTEGER NOT NULL DEFAULT 0,
    "maximoDias" INTEGER NOT NULL DEFAULT 0,
    "inicioAtualEm" DATE,
    "ultimoTreinoEm" DATE,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfensivaTreino_pkey" PRIMARY KEY ("alunoId", "modalidadeId")
);

CREATE INDEX "OfensivaTreino_modalidadeId_maximoDias_idx"
ON "OfensivaTreino"("modalidadeId", "maximoDias");

CREATE INDEX "OfensivaTreino_maximoDias_idx" ON "OfensivaTreino"("maximoDias");

ALTER TABLE "OfensivaTreino"
ADD CONSTRAINT "OfensivaTreino_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfensivaTreino"
ADD CONSTRAINT "OfensivaTreino_modalidadeId_fkey"
FOREIGN KEY ("modalidadeId") REFERENCES "Modalidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
