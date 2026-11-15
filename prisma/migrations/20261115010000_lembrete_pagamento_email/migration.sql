CREATE TABLE "LembretePagamentoEmail" (
    "id" TEXT NOT NULL,
    "mensalidadeId" TEXT NOT NULL,
    "remetente" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "primeiraTentativaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservadoAte" TIMESTAMP(3),
    "enviadoEm" TIMESTAMP(3),
    "resendId" TEXT,
    "ultimoErro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LembretePagamentoEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LembretePagamentoEmail_mensalidadeId_key" ON "LembretePagamentoEmail"("mensalidadeId");

ALTER TABLE "LembretePagamentoEmail" ADD CONSTRAINT "LembretePagamentoEmail_mensalidadeId_fkey" FOREIGN KEY ("mensalidadeId") REFERENCES "Mensalidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
