-- O teto do repasse interno passa a pertencer à modalidade e não à configuração global.
ALTER TABLE "Modalidade"
ADD COLUMN "valorRepasseProfessor" DECIMAL(10, 2) NOT NULL DEFAULT 50.00;

-- Regra inicial aprovada: Kickboxing recebe R$ 60,00; as demais, R$ 50,00.
UPDATE "Modalidade"
SET "valorRepasseProfessor" = 60.00
WHERE "nome" = 'Kickboxing';
