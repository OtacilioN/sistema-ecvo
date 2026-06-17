ALTER TABLE "Usuario" ADD COLUMN "dataNascimento" TIMESTAMP(3);

UPDATE "Usuario" AS usuario
SET "dataNascimento" = aluno."dataNascimento"
FROM "Aluno" AS aluno
WHERE aluno."usuarioId" = usuario."id"
  AND aluno."dataNascimento" IS NOT NULL
  AND usuario."dataNascimento" IS NULL;
