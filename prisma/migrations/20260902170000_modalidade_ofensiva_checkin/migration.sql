-- Permite reclassificar uma presença somente no ranking de ofensiva, sem alterar
-- a aula nem os créditos históricos do livro-razão de horas.
ALTER TABLE "Checkin" ADD COLUMN "modalidadeOfensivaId" TEXT;

CREATE INDEX "Checkin_modalidadeOfensivaId_idx" ON "Checkin"("modalidadeOfensivaId");

ALTER TABLE "Checkin"
ADD CONSTRAINT "Checkin_modalidadeOfensivaId_fkey"
FOREIGN KEY ("modalidadeOfensivaId") REFERENCES "Modalidade"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
