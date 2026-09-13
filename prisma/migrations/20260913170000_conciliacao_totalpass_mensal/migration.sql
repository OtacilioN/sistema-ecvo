-- TotalPass mensal usa uma origem interna fixa, pois o relatório não informa unidade.
ALTER TABLE "Importacao" DROP CONSTRAINT "Importacao_resumo_mensal_check";
ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_resumo_mensal_check"
  CHECK (NOT "resumoMensal" OR (
    "plataforma" IN ('WELLHUB', 'TOTALPASS') AND
    "competencia" IS NOT NULL AND "competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND
    "unidadeExternaId" IS NOT NULL AND length(trim("unidadeExternaId")) > 0 AND
    ("plataforma" <> 'TOTALPASS' OR "unidadeExternaId" = 'TOTALPASS_MENSAL')
  ));
