ALTER TYPE "TipoAcaoAudit" ADD VALUE 'MODALIDADE_CONFIGURADA';

ALTER TABLE "Modalidade"
  ADD COLUMN "janelaComparecimentoHoras" INTEGER,
  ADD COLUMN "prazoCancelamentoHoras" INTEGER,
  ADD COLUMN "exigirComparecimentoParaCheckin" BOOLEAN,
  ADD COLUMN "politicaCheckinSemComparecimento" "PoliticaCheckinSemComparecimento",
  ADD COLUMN "listaEsperaAtiva" BOOLEAN;
