ALTER TABLE "AlunoPlanoModalidade"
ADD COLUMN "plataformaExterna" "Plataforma";

CREATE INDEX "AlunoPlanoModalidade_plataformaExterna_idx"
ON "AlunoPlanoModalidade"("plataformaExterna");
