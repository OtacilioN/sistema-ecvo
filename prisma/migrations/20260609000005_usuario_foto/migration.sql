ALTER TABLE "Usuario" ADD COLUMN "fotoUrl" TEXT;

UPDATE "Usuario" AS u
SET "fotoUrl" = a."fotoUrl"
FROM "Aluno" AS a
WHERE a."usuarioId" = u."id"
  AND a."fotoUrl" IS NOT NULL;

UPDATE "Usuario" AS u
SET "fotoUrl" = p."fotoUrl"
FROM "Professor" AS p
WHERE p."usuarioId" = u."id"
  AND p."fotoUrl" IS NOT NULL
  AND u."fotoUrl" IS NULL;
