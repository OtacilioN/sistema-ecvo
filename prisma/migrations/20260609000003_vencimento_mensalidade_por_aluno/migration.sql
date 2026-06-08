ALTER TABLE "Aluno"
ADD COLUMN "diaVencimento" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "Aluno"
ADD CONSTRAINT "Aluno_diaVencimento_check" CHECK ("diaVencimento" BETWEEN 1 AND 28);

ALTER TABLE "Plano"
DROP COLUMN "diaVencimento";
