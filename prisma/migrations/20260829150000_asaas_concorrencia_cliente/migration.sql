-- Reserva o vínculo local antes da chamada remota. Assim, duas ações concorrentes
-- para o mesmo aluno não criam clientes duplicados no Asaas.
ALTER TABLE "ClienteAsaas"
ALTER COLUMN "asaasCustomerId" DROP NOT NULL,
ADD COLUMN "ultimoErro" TEXT;

-- Mantém o histórico de todas as tentativas remotas de uma mensalidade. Uma
-- tentativa terminal nunca tem o identificador apagado para que webhooks tardios
-- continuem vinculados ao pagamento correto.
ALTER TYPE "TipoCobrancaAsaas" ADD VALUE 'PIX_AUTOMATICO_FALLBACK';

DROP INDEX "CobrancaAsaas_mensalidadeId_key";

ALTER TABLE "CobrancaAsaas"
ADD COLUMN "geracao" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "ativa" BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN "vencimentoAsaas" TIMESTAMP(3),
ADD COLUMN "recebidaEmAsaas" TIMESTAMP(3),
ADD COLUMN "estornoParcialPendenteEm" TIMESTAMP(3);

UPDATE "CobrancaAsaas"
SET "ativa" = CASE
  WHEN "status" IN ('CRIANDO', 'PENDENTE', 'RECEBIDA', 'VENCIDA', 'ERRO') THEN TRUE
  WHEN "status" = 'RECUSADA' AND "tipo" = 'PIX_AUTOMATICO_RECORRENTE' THEN TRUE
  ELSE FALSE
END;

ALTER TABLE "Mensalidade"
ADD COLUMN "cobrancaQuitacaoAsaasId" TEXT;

-- O modelo anterior era 1:1, portanto a cobrança recebida identifica de forma
-- determinística a tentativa que quitou cada mensalidade já paga via Asaas.
UPDATE "Mensalidade" AS m
SET "cobrancaQuitacaoAsaasId" = c."id"
FROM "CobrancaAsaas" AS c
WHERE c."mensalidadeId" = m."id"
  AND m."status" = 'PAGA'
  AND m."formaPagamento" = 'PIX_ASAAS'
  AND c."status" = 'RECEBIDA';

UPDATE "CobrancaAsaas" AS c
SET "recebidaEmAsaas" = m."pagoEm"
FROM "Mensalidade" AS m
WHERE c."mensalidadeId" = m."id"
  AND c."status" = 'RECEBIDA'
  AND m."formaPagamento" = 'PIX_ASAAS';

CREATE UNIQUE INDEX "CobrancaAsaas_mensalidadeId_geracao_key"
ON "CobrancaAsaas"("mensalidadeId", "geracao");

CREATE INDEX "CobrancaAsaas_mensalidadeId_ativa_idx"
ON "CobrancaAsaas"("mensalidadeId", "ativa");

CREATE UNIQUE INDEX "CobrancaAsaas_uma_ativa_por_mensalidade_key"
ON "CobrancaAsaas"("mensalidadeId")
WHERE "ativa" = TRUE;

CREATE UNIQUE INDEX "Mensalidade_cobrancaQuitacaoAsaasId_key"
ON "Mensalidade"("cobrancaQuitacaoAsaasId");

CREATE UNIQUE INDEX "ContratoPixAutomatico_asaasConciliationId_key"
ON "ContratoPixAutomatico"("asaasConciliationId");

ALTER TABLE "Mensalidade"
ADD CONSTRAINT "Mensalidade_cobrancaQuitacaoAsaasId_fkey"
FOREIGN KEY ("cobrancaQuitacaoAsaasId") REFERENCES "CobrancaAsaas"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
