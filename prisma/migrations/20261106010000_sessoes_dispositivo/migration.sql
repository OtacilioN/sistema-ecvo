CREATE TABLE "SessaoDispositivo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogadaEm" TIMESTAMP(3),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessaoDispositivo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SessaoDispositivo_usuarioId_idx" ON "SessaoDispositivo"("usuarioId");
CREATE INDEX "SessaoDispositivo_expiraEm_idx" ON "SessaoDispositivo"("expiraEm");
ALTER TABLE "SessaoDispositivo" ADD CONSTRAINT "SessaoDispositivo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
