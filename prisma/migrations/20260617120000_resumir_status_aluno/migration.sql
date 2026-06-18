-- Resume status administrativos antigos em TRANCADO/CANCELADO.
-- INATIVO e SUSPENSO passam a TRANCADO antes da recriacao do enum.

ALTER TYPE "StatusAluno" RENAME TO "StatusAluno_old";

CREATE TYPE "StatusAluno" AS ENUM ('ATIVO', 'CANCELADO', 'INADIMPLENTE', 'TRANCADO');

ALTER TABLE "Aluno"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "StatusAluno"
  USING (
    CASE
      WHEN "status"::text IN ('INATIVO', 'SUSPENSO') THEN 'TRANCADO'
      ELSE "status"::text
    END
  )::"StatusAluno",
  ALTER COLUMN "status" SET DEFAULT 'ATIVO';

DROP TYPE "StatusAluno_old";
