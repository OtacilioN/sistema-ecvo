-- Estados transitórios impedem novas cobranças enquanto o cancelamento remoto
-- está em andamento e permitem que webhook/cron concluam a recuperação.
ALTER TYPE "StatusContratoPixAutomatico" ADD VALUE 'CANCELANDO' BEFORE 'CONCLUIDO';
ALTER TYPE "StatusCobrancaAsaas" ADD VALUE 'CANCELANDO' BEFORE 'RECEBIDA';
