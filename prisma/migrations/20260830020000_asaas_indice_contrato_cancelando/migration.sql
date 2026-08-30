-- CANCELANDO ainda representa um contrato operacionalmente aberto. Incluí-lo no
-- índice impede que uma retomada concorrente crie outro semestre para o aluno.
DROP INDEX IF EXISTS "ContratoPixAutomatico_alunoId_aberto_key";

CREATE UNIQUE INDEX "ContratoPixAutomatico_alunoId_aberto_key"
ON "ContratoPixAutomatico"("alunoId")
WHERE "status" IN ('CRIANDO', 'PENDENTE_AUTORIZACAO', 'ATIVO', 'CANCELANDO');
