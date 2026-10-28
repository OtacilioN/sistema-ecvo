-- Contratos existentes preservam totalCiclos = 6; o novo modo só afeta novas autorizações.
ALTER TYPE "TipoCobrancaPix" ADD VALUE 'AUTOMATICO_TRIMESTRAL';

ALTER TABLE "ContratoPixAutomatico"
  ADD CONSTRAINT "ContratoPixAutomatico_totalCiclos_check" CHECK ("totalCiclos" IN (3, 6));
