-- Guarda o grau anterior no proprio historico de graduacao (RF-042).
ALTER TABLE "GraduacaoAluno" ADD COLUMN "graduacaoAnteriorId" TEXT;

CREATE INDEX "GraduacaoAluno_graduacaoAnteriorId_idx" ON "GraduacaoAluno"("graduacaoAnteriorId");

ALTER TABLE "GraduacaoAluno"
ADD CONSTRAINT "GraduacaoAluno_graduacaoAnteriorId_fkey"
FOREIGN KEY ("graduacaoAnteriorId") REFERENCES "Graduacao"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
