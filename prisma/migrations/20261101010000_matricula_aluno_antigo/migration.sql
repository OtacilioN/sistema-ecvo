BEGIN;
ALTER TABLE "Plano" ADD COLUMN "alunoAntigo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SolicitacaoMatricula" ADD COLUMN "descontoAlunoAntigo" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Plano_alunoAntigo_ativo_key" ON "Plano" ("alunoAntigo") WHERE "alunoAntigo" AND "ativo";
ALTER TABLE "Plano" ADD CONSTRAINT "Plano_alunoAntigo_check" CHECK (NOT "alunoAntigo" OR (NOT "familia" AND NOT "padrao" AND "quantidadeModalidadesMatricula" IS NULL AND "periodicidade" = 'MENSAL'));
ALTER TABLE "SolicitacaoMatricula" ADD CONSTRAINT "SolicitacaoMatricula_alunoAntigo_check" CHECK (NOT "descontoAlunoAntigo" OR ("tipoPagamento" = 'MENSALISTA' AND "matriculaFamiliaId" IS NULL));
INSERT INTO "Plano" ("id", "nome", "valor", "valorBase", "periodicidade", "ativo", "padrao", "familia", "alunoAntigo", "criadoEm", "atualizadoEm")
VALUES ('plano-alunos-antigos', 'Alunos antigos', 90, 120, 'MENSAL', true, false, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "LogAuditoria" ("id", "autorId", "acao", "entidade", "entidadeId", "valorNovo", "justificativa", "criadoEm")
VALUES ('plano-alunos-antigos-20261101', NULL, 'PLANO', 'Plano', 'plano-alunos-antigos', jsonb_build_object('valorComDesconto', 90, 'valorBase', 120), 'Criação do plano de matrícula para alunos antigos.', CURRENT_TIMESTAMP);
COMMIT;
