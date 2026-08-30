CREATE TYPE "TipoPagamentoMatricula" AS ENUM ('MENSALISTA', 'WELLHUB', 'TOTALPASS');

ALTER TABLE "SolicitacaoMatricula"
  ADD COLUMN "tipoPagamento" "TipoPagamentoMatricula" NOT NULL DEFAULT 'MENSALISTA',
  ADD COLUMN "beneficioAtivoDeclarado" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SolicitacaoMatricula"
  ADD CONSTRAINT "SolicitacaoMatricula_beneficio_ativo_check"
  CHECK (
    ("tipoPagamento" = 'MENSALISTA' AND NOT "beneficioAtivoDeclarado")
    OR
    ("tipoPagamento" IN ('WELLHUB', 'TOTALPASS') AND "beneficioAtivoDeclarado")
  );

ALTER TABLE "SolicitacaoMatricula"
  ADD CONSTRAINT "SolicitacaoMatricula_plano_externo_check"
  CHECK ("tipoPagamento" = 'MENSALISTA' OR "planoId" IS NULL);

CREATE INDEX "SolicitacaoMatricula_tipoPagamento_status_idx"
  ON "SolicitacaoMatricula"("tipoPagamento", "status");
