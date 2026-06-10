CREATE TABLE "InscricaoPush" (
  "id" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "expiraEm" TIMESTAMP(3),
  "userAgent" TEXT,
  "ultimoUsoEm" TIMESTAMP(3),
  "revogadaEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InscricaoPush_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InscricaoPush_endpoint_key" ON "InscricaoPush"("endpoint");
CREATE INDEX "InscricaoPush_usuarioId_revogadaEm_idx" ON "InscricaoPush"("usuarioId", "revogadaEm");
CREATE INDEX "InscricaoPush_atualizadoEm_idx" ON "InscricaoPush"("atualizadoEm");

ALTER TABLE "InscricaoPush"
ADD CONSTRAINT "InscricaoPush_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
