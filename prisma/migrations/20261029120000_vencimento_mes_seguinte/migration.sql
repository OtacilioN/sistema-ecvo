-- Cadastros existentes mantêm sua regra. A nova regra é definida no pagamento inicial.
ALTER TABLE "Aluno"
ADD COLUMN "vencimentoMesSeguinte" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Aluno"
ADD CONSTRAINT "Aluno_vencimentoMesSeguinte_check"
CHECK (NOT "vencimentoMesSeguinte" OR "diaVencimento" = 1);
