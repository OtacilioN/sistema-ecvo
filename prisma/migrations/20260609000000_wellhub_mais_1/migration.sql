-- Inserir plano Wellhub +1 com valor de R$ 90,00, sem vínculo inicial de modalidades.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Plano'
      AND column_name = 'diaVencimento'
  ) THEN
    INSERT INTO "Plano" (
      "id",
      "nome",
      "valor",
      "periodicidade",
      "diaVencimento",
      "limiteAulas",
      "ativo",
      "criadoEm",
      "atualizadoEm"
    )
    SELECT
      'wellhub-plus-1',
      'Wellhub +1',
      90,
      'MENSAL',
      10,
      NULL,
      TRUE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    WHERE NOT EXISTS (
      SELECT 1
      FROM "Plano"
      WHERE "nome" = 'Wellhub +1'
        AND "valor" = 90
    )
    ON CONFLICT ("id") DO NOTHING;
  ELSE
    INSERT INTO "Plano" (
      "id",
      "nome",
      "valor",
      "periodicidade",
      "limiteAulas",
      "ativo",
      "criadoEm",
      "atualizadoEm"
    )
    SELECT
      'wellhub-plus-1',
      'Wellhub +1',
      90,
      'MENSAL',
      NULL,
      TRUE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    WHERE NOT EXISTS (
      SELECT 1
      FROM "Plano"
      WHERE "nome" = 'Wellhub +1'
        AND "valor" = 90
    )
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;
