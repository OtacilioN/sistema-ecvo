ALTER TABLE "LogAuditoria" DROP CONSTRAINT "LogAuditoria_autorId_fkey";

ALTER TABLE "LogAuditoria" ALTER COLUMN "autorId" DROP NOT NULL;

ALTER TABLE "LogAuditoria"
  ADD CONSTRAINT "LogAuditoria_autorId_fkey"
  FOREIGN KEY ("autorId")
  REFERENCES "Usuario"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
