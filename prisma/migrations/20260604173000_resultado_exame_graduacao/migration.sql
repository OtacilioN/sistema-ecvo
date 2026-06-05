ALTER TABLE "InscricaoExame"
  ADD COLUMN "novaGraduacaoId" TEXT;

CREATE INDEX "InscricaoExame_novaGraduacaoId_idx" ON "InscricaoExame"("novaGraduacaoId");

ALTER TABLE "InscricaoExame"
  ADD CONSTRAINT "InscricaoExame_novaGraduacaoId_fkey"
  FOREIGN KEY ("novaGraduacaoId") REFERENCES "Graduacao"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
