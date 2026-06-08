-- Permite que uma turma recorrente tenha vários dias da semana em uma única entrada.
ALTER TABLE "Turma" ADD COLUMN "diasSemana" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

UPDATE "Turma"
SET "diasSemana" = ARRAY["diaSemana"]::INTEGER[]
WHERE "diaSemana" IS NOT NULL
  AND cardinality("diasSemana") = 0;
