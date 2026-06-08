-- Vincula alunos não Wellhub/TotalPass ao plano correto conforme quantidade de modalidades.
WITH modalidades_por_aluno AS (
  SELECT
    a.id AS "alunoId",
    COUNT(am."B")::int AS "quantidadeModalidades"
  FROM "Aluno" a
  LEFT JOIN "_AlunoModalidade" am ON am."A" = a.id
  WHERE a.tipo NOT IN ('WELLHUB', 'TOTALPASS')
  GROUP BY a.id
)
UPDATE "Aluno" a
SET "planoId" = CASE mpa."quantidadeModalidades"
  WHEN 1 THEN 'plano-1-modalidade-de-luta'
  WHEN 2 THEN 'plano-2-modalidades-de-luta'
  WHEN 3 THEN 'plano-3-modalidades-de-luta'
  ELSE a."planoId"
END
FROM modalidades_por_aluno mpa
WHERE a.id = mpa."alunoId"
  AND mpa."quantidadeModalidades" IN (1, 2, 3)
  AND a."planoId" IS DISTINCT FROM CASE mpa."quantidadeModalidades"
    WHEN 1 THEN 'plano-1-modalidade-de-luta'
    WHEN 2 THEN 'plano-2-modalidades-de-luta'
    WHEN 3 THEN 'plano-3-modalidades-de-luta'
    ELSE a."planoId"
  END;

