ALTER TABLE "Modalidade"
ADD COLUMN "checkinSemRestricaoHorario" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Checkin"
ADD COLUMN "realizadoEm" TIMESTAMP(3),
ADD COLUMN "associadoAutomaticamente" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Checkin"
SET "realizadoEm" = "criadoEm"
WHERE "realizadoEm" IS NULL;

ALTER TABLE "Checkin"
ALTER COLUMN "realizadoEm" SET NOT NULL,
ALTER COLUMN "realizadoEm" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Checkin_alunoId_realizadoEm_idx" ON "Checkin"("alunoId", "realizadoEm");
