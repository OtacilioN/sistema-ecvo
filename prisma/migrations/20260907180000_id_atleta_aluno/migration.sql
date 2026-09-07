ALTER TABLE "Aluno"
  ADD COLUMN "idAtleta" TEXT;

ALTER TABLE "Aluno"
  ADD CONSTRAINT "Aluno_idAtleta_apenas_digitos_check"
  CHECK (
    "idAtleta" IS NULL
    OR (
      char_length("idAtleta") BETWEEN 1 AND 32
      AND "idAtleta" ~ '^[0-9]+$'
    )
  );

WITH mapeamento("nome", "idAtleta") AS (
  VALUES
    ('Arthur Henrique Costa Macena', '55975'),
    ('Daniel Alves', '55262'),
    ('Gabriel Gomes', '55972'),
    ('Giovana', '55967'),
    ('Gustavo', '53666'),
    ('Jonathan barber', '55521'),
    ('Kennedy Otaviano', '55974'),
    ('Michael', '55977'),
    ('Castro', '55516'),
    ('Otacílio Maia', '52820'),
    ('Pedro Lima', '53667'),
    ('Ronaldy Ribeiro', '55519'),
    ('Yasmin Fidelis', '55979')
),
candidatos AS (
  SELECT
    mapeamento."nome",
    mapeamento."idAtleta",
    min(aluno."id") AS "alunoId"
  FROM mapeamento
  INNER JOIN "Usuario" AS usuario
    ON usuario."nome" = mapeamento."nome"
  INNER JOIN "Aluno" AS aluno
    ON aluno."usuarioId" = usuario."id"
  GROUP BY mapeamento."nome", mapeamento."idAtleta"
  HAVING count(*) = 1
),
gestor AS (
  SELECT "id"
  FROM "Usuario"
  WHERE "papel" = 'GESTOR'
    AND "ativo" = true
    AND "nome" IN ('Otacilio', 'Otacilio Maia', 'Otacílio Maia')
  ORDER BY
    CASE "nome"
      WHEN 'Otacilio' THEN 0
      WHEN 'Otacilio Maia' THEN 1
      ELSE 2
    END,
    "criadoEm",
    "id"
  LIMIT 1
),
atualizados AS (
  UPDATE "Aluno" AS aluno
  SET
    "idAtleta" = candidatos."idAtleta",
    "atualizadoEm" = CURRENT_TIMESTAMP
  FROM candidatos
  WHERE aluno."id" = candidatos."alunoId"
    AND aluno."idAtleta" IS NULL
  RETURNING aluno."id", aluno."idAtleta"
)
INSERT INTO "LogAuditoria" (
  "id",
  "autorId",
  "acao",
  "entidade",
  "entidadeId",
  "valorAntigo",
  "valorNovo",
  "justificativa",
  "criadoEm"
)
SELECT
  'mig-id-atleta-' || md5(atualizados."id" || ':' || atualizados."idAtleta"),
  gestor."id",
  'CONFIGURACAO',
  'Aluno',
  atualizados."id",
  jsonb_build_object('idAtleta', NULL),
  jsonb_build_object('idAtleta', atualizados."idAtleta"),
  'Preenchimento inicial do ID de atleta conforme cadastro CBKB.',
  CURRENT_TIMESTAMP
FROM atualizados
CROSS JOIN gestor;

CREATE UNIQUE INDEX "Aluno_idAtleta_key"
  ON "Aluno"("idAtleta");
