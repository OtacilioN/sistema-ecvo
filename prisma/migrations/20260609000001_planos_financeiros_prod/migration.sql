-- Plano de produção atual (de teste): remover aluno de exemplo vinculado e o plano antigo.
DELETE FROM "Mensalidade"
WHERE "planoId" = 'plano-mensal-demo';

DELETE FROM "Aluno"
WHERE "id" IN (
  SELECT a.id
  FROM "Aluno" a
  JOIN "Usuario" u ON u.id = a."usuarioId"
  WHERE a."planoId" = 'plano-mensal-demo'
    AND (u.email = 'aluno@ecvo.com.br' OR a.tipo = 'MENSALISTA')
);

DELETE FROM "Plano"
WHERE "id" = 'plano-mensal-demo';

-- Planos solicitados para produção.
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
  'plano-1-modalidade-de-luta',
  '1 modalidade de luta',
  100.00,
  'MENSAL',
  10,
  NULL,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Plano"
  WHERE "id" = 'plano-1-modalidade-de-luta'
);

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
  'plano-2-modalidades-de-luta',
  '2 modalidades de luta',
  175.00,
  'MENSAL',
  10,
  NULL,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Plano"
  WHERE "id" = 'plano-2-modalidades-de-luta'
);

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
  'plano-3-modalidades-de-luta',
  '3 modalidades de luta',
  235.00,
  'MENSAL',
  10,
  NULL,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Plano"
  WHERE "id" = 'plano-3-modalidades-de-luta'
);

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
  'plano-aluno-bolsista-integral',
  'Aluno bolsista integral',
  0.00,
  'MENSAL',
  10,
  NULL,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Plano"
  WHERE "id" = 'plano-aluno-bolsista-integral'
);

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
  90.00,
  'MENSAL',
  10,
  NULL,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Plano"
  WHERE "id" = 'wellhub-plus-1'
);
