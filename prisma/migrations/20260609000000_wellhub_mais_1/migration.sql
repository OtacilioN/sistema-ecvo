-- Inserir plano Wellhub +1 com valor de R$ 90,00, sem vínculo inicial de modalidades.
INSERT INTO "Plano" (
  "id",
  "nome",
  "valor",
  "periodicidade",
  "diaVencimento",
  "limiteAulas",
  "ativo"
)
SELECT
  'wellhub-plus-1',
  'Wellhub +1',
  90,
  'MENSAL',
  10,
  NULL,
  TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM "Plano"
  WHERE "nome" = 'Wellhub +1'
    AND "valor" = 90
);
