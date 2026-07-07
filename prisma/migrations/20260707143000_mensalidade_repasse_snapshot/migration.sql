-- Preserva as modalidades/cobrancas usadas no cálculo de repasse no momento da mensalidade.
ALTER TABLE "Mensalidade" ADD COLUMN "repasseSnapshot" JSONB;
