ALTER TABLE "Usuario" ADD COLUMN "sessaoVersao" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "recuperacaoHash" TEXT,
ADD COLUMN "recuperacaoExpiraEm" TIMESTAMP(3),
ADD COLUMN "recuperacaoEnviadaEm" TIMESTAMP(3);
CREATE UNIQUE INDEX "Usuario_recuperacaoHash_key" ON "Usuario"("recuperacaoHash");
