BEGIN;

-- O preço atual continua sendo o valor com desconto (inclusive na matrícula).
ALTER TABLE "Plano" ADD COLUMN "valorBase" DECIMAL(10,2);

UPDATE "Plano" SET "valorBase" = CASE
  WHEN "periodicidade" = 'MENSAL' AND NOT "familia"
    AND ("quantidadeModalidadesMatricula" = 3 OR "id" = 'plano-3-modalidades-de-luta') THEN 290
  WHEN "periodicidade" = 'MENSAL' AND "familia" AND "valor" = 90 THEN 100
  WHEN "periodicidade" = 'MENSAL' AND NOT "familia" AND "valor" IN (90, 100) THEN 120
  WHEN "periodicidade" = 'MENSAL' AND "valor" = 180 THEN 200
  ELSE "valor"
END;

ALTER TABLE "Plano" ALTER COLUMN "valorBase" SET NOT NULL;
ALTER TABLE "Plano" ADD CONSTRAINT "Plano_precos_adimplencia_check"
  CHECK ("valor" >= 0 AND "valorBase" >= "valor");

INSERT INTO "LogAuditoria" ("id", "autorId", "acao", "entidade", "entidadeId", "valorAntigo", "valorNovo", "justificativa", "criadoEm")
SELECT 'adimplencia-20261028-' || "id", NULL, 'PLANO', 'Plano', "id",
  jsonb_build_object('valor', "valor"),
  jsonb_build_object('valorComDesconto', "valor", 'valorBase', "valorBase"),
  'Configuração inicial dos dois preços e carência de 4 dias do desconto de adimplência.', CURRENT_TIMESTAMP
FROM "Plano";

-- Mensalidades já emitidas mantêm o contrato original. Novas competências recebem snapshots.
ALTER TABLE "Mensalidade" ADD COLUMN "valorBase" DECIMAL(10,2),
  ADD COLUMN "valorComDesconto" DECIMAL(10,2);
ALTER TABLE "Mensalidade" ADD CONSTRAINT "Mensalidade_precos_adimplencia_check"
  CHECK (("valorBase" IS NULL AND "valorComDesconto" IS NULL) OR
    ("valorBase" IS NOT NULL AND "valorComDesconto" IS NOT NULL
      AND "valorComDesconto" >= 0 AND "valorBase" >= "valorComDesconto"));

ALTER TABLE "Notificacao" ADD COLUMN "chaveDeduplicacao" TEXT;
CREATE UNIQUE INDEX "Notificacao_chaveDeduplicacao_key" ON "Notificacao"("chaveDeduplicacao");

COMMIT;
