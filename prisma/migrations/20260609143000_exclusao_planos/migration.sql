-- Permite excluir planos preservando o histórico de mensalidades.
-- Mensalidades antigas mantêm valor, vencimento e status; o vínculo ao plano removido fica nulo.
ALTER TABLE "Mensalidade" DROP CONSTRAINT "Mensalidade_planoId_fkey";

ALTER TABLE "Mensalidade" ALTER COLUMN "planoId" DROP NOT NULL;

ALTER TABLE "Mensalidade"
ADD CONSTRAINT "Mensalidade_planoId_fkey"
FOREIGN KEY ("planoId") REFERENCES "Plano"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
