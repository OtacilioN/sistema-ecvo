# Requisitos — Sistema ECVO

Transcrição estruturada do documento de requisitos (`documento_requisitos_ecvo.pdf`). Fonte de verdade
para o escopo. Veja também `glossario.md` e `rastreabilidade.md`.

## 1. Visão geral

Web app para gerenciar a ECVO, escola de combate com múltiplas modalidades (kickboxing, boxe, muay thai,
no-gi, jiu-jitsu, MMA, wrestling, defesa pessoal e outras cadastráveis). Organiza alunos, professores,
modalidades, horários, agendamentos de aula, check-ins, presenças, horas treinadas, graduações, pagamentos e
conciliação de alunos Wellhub/TotalPass.

Diferencial central: acompanhamento da evolução por **horas treinadas** (jornada das 10 mil horas), com
total geral e por modalidade.

Conceitos-chave (ver glossário): **agendamento de aula** ≠ **check-in** (participação) ⇒ **presença**
(derivada de check-in válido).

## 2. Papéis

- **Gestor** — administra a academia (pode haver vários).
- **Secretaria** — acessa a visão administrativa em modo majoritariamente leitura; pode cadastrar alunos e
  editar dados gerais de aluno.
- **Professor** — ministra aulas, acompanha alunos, invalida check-ins indevidos, registra observações e graduações.
- **Aluno** — acessa a grade, agenda aulas, faz check-in, acompanha evolução.

## 3. Tipos de aluno

Mensalista, Wellhub, TotalPass, Avulso. A **experiência de treino é igual** para todos; difere a **gestão
financeira** e a **conciliação**. Wellhub/TotalPass podem ter também um plano mensal interno para
modalidades pagas diretamente à academia.

## 4. Escopo do MVP

Dentro: cadastros (gestor/professor/aluno), classificação de aluno por tipo, modalidades, turmas e horários,
grade para o aluno, agendamento de aula, check-in, presença automática por check-in válido, invalidação de
check-in, contador de horas (geral e por modalidade), perfil do aluno, graduações + registro pelo professor,
financeiro de mensalistas, pagamentos avulsos, importação Wellhub/TotalPass + conciliação, relatórios básicos.

Fora do MVP: integrações automáticas via API de Wellhub/TotalPass/Gympass, conciliação financeira
automática dessas plataformas, reconhecimento facial, app mobile nativo, papéis separados
(coordenador/financeiro/contador), aluno experimental. A integração financeira com Asaas descrita em
RF-053.3 a RF-053.5 é uma extensão posterior incorporada ao produto.

## 5. Permissões por papel (resumo)

- **Gestor**: CRUD de alunos/professores/gestores/modalidades/turmas; planos e mensalidades; pagamentos;
  inadimplência; relatórios; importação e conciliação; configurações; invalidar check-ins; auditoria.
- **Secretaria**: visão administrativa de leitura para cadastros, turmas, financeiro, conciliação,
  relatórios, auditoria e configurações; pode cadastrar alunos e editar dados gerais de aluno.
- **Professor**: ver suas aulas; ver agendamentos/check-ins/presentes; invalidar check-ins; histórico
  técnico; horas por modalidade; observações; registrar e consultar graduações. Não gerencia financeiro.
- **Aluno**: ver a própria grade; agendar/cancelar agendamento de aula; fazer check-in; consultar check-ins,
  presenças, horas (geral e por modalidade), graduações, perfil e pendências financeiras (se houver plano
  mensal interno).

## 6. Requisitos funcionais (RF)

### Gestão de alunos
- **RF-001** Cadastro de aluno (nome, CPF, nascimento, telefone, e-mail, endereço, foto, tipo, status,
  modalidades, data de início, contato de emergência, observações admin/técnicas, restrições médicas,
  identificador externo).
- **RF-001.1** O candidato pode solicitar a própria matrícula em rota pública, informando seus dados,
  escolhendo antes do cadastro entre mensalista, aula avulsa, Wellhub ou TotalPass, selecionando uma modalidade e
  consultando a grade recorrente ativa publicada para ela. Os atalhos públicos usam
  `?tipoPagamento=mensalista`, `aula-avulsa`, `wellhub` ou `totalpass`. No fluxo mensalista, pode anexar um comprovante
  PIX opcional em imagem ou PDF; o sistema aplica o plano padrão, emite a cobrança PIX da primeira
  mensalidade no Asaas e só coloca a solicitação na fila administrativa após `PAYMENT_RECEIVED`. Wellhub
  exige declaração de benefício ativo a partir do plano Basic e TotalPass a partir do TP1+; esses fluxos
  não geram pagamento de matrícula, mensalidade, plano interno ou cobrança Asaas. A solicitação não cria
  uma conta de aluno antes da análise.
- **RF-001.2** O gestor visualiza as matrículas pendentes e aprova cada solicitação em uma única operação,
  confirmando o dia de vencimento apenas para mensalistas. A aprovação mensalista usa o plano e o valor
  preservados na cobrança, cria o aluno e registra a mensalidade inicial paga pelo Asaas. A aprovação
  Wellhub/TotalPass cria o aluno com o tipo e o vínculo externo da modalidade correspondentes, sem efeitos
  financeiros internos. O comprovante anexado é evidência privada opcional do fluxo mensalista e nunca
  substitui nem duplica a confirmação integrada.
- **RF-001.3** Cada nova solicitação de matrícula e cada aprovação concluída gera uma notificação interna
  com tentativa de Web Push para todos os gestores ativos, incluindo o gestor que realizou a aprovação.
- **RF-001.4** No cadastro de aula avulsa, o candidato escolhe uma ocorrência futura, não cancelada e de
  turma recorrente ativa da modalidade selecionada. O Asaas cobra R$ 20,00; após `PAYMENT_RECEIVED` e
  aprovação administrativa, o aluno recebe reserva e check-in somente para essa `Aula`. Na semana civil
  da aula (segunda a domingo, em `America/Sao_Paulo`), o aluno pode fechar o plano mensal padrão de
  R$ 100,00 pagando um complemento Asaas de R$ 80,00. Somente `PAYMENT_RECEIVED` do complemento converte
  o vínculo para mensalista e cria a mensalidade canônica paga de R$ 100,00, com crédito de R$ 20,00 e
  recebimento complementar de R$ 80,00 preservados para auditoria.
- **RF-002** Status: Ativo, Inativo, Suspenso, Cancelado, Inadimplente, Trancado.
- **RF-003** Perfil do aluno (dados, tipo, status, modalidades, plano, situação financeira, históricos de
  agendamento/check-in/invalidações/presença, horas gerais e por modalidade, graduações e histórico,
  observações técnicas, documentos, histórico de conciliação).
- **RF-004** Aluno menor de idade vinculado a um responsável (nome, CPF, telefone, e-mail, parentesco,
  responsabilidade financeira).

### Gestão de professores
- **RF-005** Cadastro de professor (nome, CPF, telefone, e-mail, foto, modalidades, status, observações).
- **RF-006** Vínculo professor ↔ turmas/horários.
- **RF-007** Professor substituto: gestor altera o professor de uma aula, mantendo registro de quem ministrou.

### Modalidades
- **RF-008** Cadastro de modalidades (lista + personalizadas).
- **RF-009** Configurações da modalidade (nome, descrição, duração padrão, status, graduações associadas,
  professores habilitados, regras específicas de check-in/agendamento).

### Turmas e horários
- **RF-010** Cadastro de turma/horário (modalidade, professor, dia, início, fim, duração, capacidade, local,
  nível, status).
- **RF-011** Grade recorrente por dia da semana.
- **RF-012** Aulas avulsas (aulão, seminário, open mat, sparring day, treino especial, exame).

### Agendamento de aula
- **RF-013** Agendamento de aula disponível.
- **RF-014** Janela de agendamento configurável (padrão 24h antes).
- **RF-015** Cancelamento de agendamento (prazo configurável).
- **RF-016** Limite de vagas (capacidade; bloqueio ou lista de espera se ativa).
- **RF-017** Status do agendamento (Confirmado, Cancelado pelo aluno, Cancelado pelo gestor, Convertido em
  check-in, Ausente, No-show).
- **RF-018** No-show: marcou agendamento mas não fez check-in.

### Check-in
- **RF-019** Realização de check-in (botão, QR Code, geolocalização a até 300 m da academia, lançamento por gestor/professor).
- **RF-020** Validação (aluno ativo; mensalista com plano vinculado e modalidade coberta pelo plano;
  aluno Wellhub/TotalPass confirma que já fez primeiro o check-in no aplicativo da plataforma;
  permissão; plano mensal interno adimplente se configurado; aula
  existente; há agendamento se exigido; vaga disponível). Na janela padrão, o check-in é permitido
  de 30 minutos antes do início até 30 minutos após o término da aula.
- **RF-020.1** A modalidade pode liberar check-in sem restrição de horário. Nesse modo, o sistema
  associa o registro a uma aula oficial do mesmo dia: prioriza agendamento confirmado, aula em andamento,
  próxima aula futura e, após o último horário, a última aula encerrada. O horário real do check-in é
  preservado e sinalizado; sem aula oficial no dia, o check-in é bloqueado.
- **RF-021** Check-in associado ao agendamento correspondente.
- **RF-022** Check-in sem agendamento prévio: permitir / bloquear / apenas com aprovação.
- **RF-023** Check-in válido gera presença automaticamente e horas conforme a duração da aula.
- **RF-024** Histórico de check-ins (data, horário real, aula oficial de referência, modalidade, método,
  responsável, status, validade e indicação de associação automática).

### Presença e invalidação
- **RF-025** Presença derivada de todo check-in válido.
- **RF-026** Lista da aula para o professor (comparecidos, com check-in, presentes, sem check-in, invalidados, observações).
- **RF-027** Professor exclui/invalida check-in → remove presença, estorna horas, registra autor/data/justificativa, mantém histórico.
- **RF-028** Gestor também pode excluir/invalidar check-ins.
- **RF-029** Status de presença (Presente por check-in, Ausente, Check-in invalidado, Check-in excluído, Pendente de revisão).
- **RF-030** Check-in válido gera presença+horas; invalidado/excluído não conta e estorna horas já geradas.
- **RF-031** Registro retroativo (com data da alteração, responsável, justificativa, auditoria).

### Horas treinadas
- **RF-032** Total geral de horas. **RF-033** Total por modalidade.
- **RF-034** Cálculo automático ao check-in válido (soma duração ao total geral e da modalidade).
- **RF-035** Estorno de horas por invalidação, mantendo registro do estorno.
- **RF-036** Progresso rumo às 10 mil horas (engajamento). **RF-037** Marcos intermediários.
- **RF-038** Ajuste manual de horas (modalidade, quantidade, motivo, responsável, auditoria);
  professores só podem lançar horas positivas para alunos vinculados às suas modalidades.
- **RF-039** Prevenção de duplicidade (mesma aula não conta duas vezes).
- **RF-039.1** Cada aluno possui uma ofensiva de treino independente por modalidade. O valor é o
  intervalo de dias civis, inclusivo, entre o primeiro e o último treino da sequência (por exemplo:
  segunda = 1, quarta = 3, sexta = 5 e segunda seguinte = 8).
- **RF-039.2** Um dia só pode quebrar ofensivas de uma modalidade quando pelo menos um aluno fez
  check-in válido nela. A ausência é consolidada depois do encerramento do dia da academia; um dia
  sem qualquer check-in válido é neutro.
- **RF-039.3** O sistema mantém a ofensiva atual e a máxima ofensiva atingida por aluno e modalidade.
  Check-in invalidado/excluído não conta e provoca recálculo do histórico afetado.
- **RF-039.4** O aluno consulta um ranking geral da academia, rankings por modalidade e sua posição.
  Cada ranking classifica pela maior ofensiva histórica. No ranking geral vale o maior recorde do aluno
  entre suas modalidades, sem somá-las; quebrar a ofensiva atual não reduz sua pontuação no ranking.
- **RF-039.5** O ciclo atual do ranking de ofensivas começa em **31/08/2026**. Check-ins de
  30/08/2026 ou anteriores permanecem no histórico de presença e horas, mas não formam dias ativos,
  ofensivas ou recordes desse ranking.

### Graduação
- **RF-040** Cadastro de graduações por modalidade. **RF-041** Graduação atual por modalidade.
- **RF-042** Histórico de graduação (modalidade, anterior, nova, data, professor, observações, anexo).
- **RF-043** Registro de graduação pelo professor.
- **RF-044** Critérios de elegibilidade (horas, frequência, tempo no grau, exame, avaliação) — **não graduam automaticamente**.
- **RF-045** Exames de graduação (data, modalidade, professor, inscritos, resultado, nova graduação, taxa).

### Financeiro
- **RF-046** Cadastro de plano, com exatamente um plano mensal ativo marcado como padrão para novas
  matrículas. **RF-047** Vínculo do plano ao aluno com mensalidade interna. **RF-048**
  Registro de mensalidades.
- **RF-049** Status financeiro (Em aberto, Paga, Vencida, Cancelada, Isenta).
- **RF-050** Adimplência. **RF-051** Bloqueio por inadimplência (alertar / bloquear agendamento / bloquear check-in / não aplicar).
- **RF-052** Pagamentos avulsos (aula, diária, pacote, seminário, evento, exame, produto).
- **RF-053** Wellhub/TotalPass podem combinar vínculo externo com plano mensal interno por modalidade.
- **RF-053.1** Divisão de receita de mensalidade interna: valor base global por modalidade; professor recebe
  até 60% do valor base cheio por modalidade. Descontos reduzem primeiro a sobra e, se a arrecadação não
  atingir o teto dos professores, reduzem
  proporcionalmente a parte dos professores.
- **RF-053.3** Cada aluno com plano mensal pode usar cobrança PIX mensal pelo Asaas. Cada competência gera
  uma cobrança dinâmica e um QR Code de uso único, sem alterar o valor histórico da mensalidade. A primeira
  cobrança também pode nascer na solicitação pública, antes da existência do aluno, e é transferida para a
  mensalidade canônica durante a aprovação.
- **RF-053.4** O gestor pode habilitar PIX Automático semestral para um aluno, e o próprio aluno pode
  habilitá-lo para si. O sistema materializa exatamente seis competências mensais pelo valor da mensalidade:
  o QR inicial paga a primeira e solicita a autorização; após a autorização ativa, somente as cinco
  instruções futuras são enviadas ao Asaas na janela admitida pelo provedor. Eventos autenticados,
  confirmados na API e idempotentes conciliam pagamento, vencimento, estorno e autorização. Se a janela
  de uma instrução for perdida, o sistema emite uma única cobrança PIX de contingência para a mesma
  competência, alerta aluno e gestores e mantém os ciclos seguintes automáticos.
- **RF-053.5** O próprio aluno e o gestor podem cancelar o PIX Automático. Antes de liberar o modo mensal
  ou uma baixa manual, o sistema consulta a conta Asaas, preserva cobranças recebidas, encerra a autorização
  e remove somente cobranças pendentes, com estados transitórios e auditoria para tolerar concorrência.
- **RF-053.2** Da sobra mensal após os professores, são abatidos primeiro R$ 2.670,00 de custos fixos
  (aluguel, água, luz e internet). Um déficit é exibido como valor negativo em vermelho; saldo zero ou
  positivo é exibido em verde. Somente o saldo positivo é dividido igualmente entre Caixa/investimento,
  Sócio A e Sócio B.

### Wellhub e TotalPass
- **RF-054** Cadastro do tipo de vínculo. **RF-055** Mesmo fluxo operacional de treino.
- **RF-056** Sem integração automática via API no MVP.
- **RF-057/058** Importação de planilhas Wellhub/TotalPass (CSV/XLSX) com metadados da importação.
- **RF-059** Identificação do aluno (CPF prioritário → e-mail → nome → telefone → identificador externo).
- **RF-060** Conciliação com histórico interno. **RF-061** Status de conciliação.
- **RF-062** Resolução manual de divergências (com log). **RF-063** Relatório de conciliação. **RF-064** Histórico de importações.
- **RF-064.1** Divisão de repasse Wellhub/TotalPass: professor recebe 60% do valor repassado pela plataforma
  no período; os 40% restantes integram a sobra mensal sujeita aos custos fixos e à divisão da RF-053.2.

### Relatórios
- **RF-065..072** Alunos, agendamentos, check-ins, presença, horas, graduação, financeiro, conciliação.

### Notificações
- **RF-073..078** Agendamento, lembrete de treino, cancelamento de aula, financeiro, graduação, check-in invalidado (configurável).

### Auditoria
- **RF-079** Log para ações críticas. **RF-080** Cada log: usuário, data/hora, tipo de ação, entidade, valor anterior, valor novo, justificativa.

## 7. Regras de negócio (RN)

RN-001 agendamento não é presença · RN-002 check-in válido conta presença · RN-003 professor atua nas
exceções · RN-004 professor pode invalidar check-in · RN-005 check-in invalidado não conta horas (estorna) ·
RN-006 horas vinculadas à modalidade · RN-007 horas também somam ao total geral · RN-008 aluno pode ter
várias graduações · RN-009 professor é responsável pela graduação · RN-010 critérios não graduam
automaticamente · RN-011 Wellhub/TotalPass conciliam por planilha no MVP · RN-012 plano mensal interno tem
controle financeiro · RN-013 avulso tem pagamentos pontuais · RN-014 **não existe aluno experimental** ·
RN-015 CPF tem prioridade na identificação · RN-016 check-in invalidado deve aparecer na conciliação ·
RN-017 repasse de mensalidade interna usa cascata: professores até o teto por modalidade, depois sobra mensal ·
RN-018 repasse Wellhub/TotalPass separa 60% para o professor e 40% para a sobra mensal.

RN-019 vencimento da mensalidade interna é configurado por aluno, com dia 10 como padrão inicial.
RN-020 plano é um pacote comercial disponível para qualquer modalidade; as modalidades contratadas são
definidas no vínculo aluno-plano e devem ser subconjunto das modalidades do aluno.
RN-021 a sobra mensal paga primeiro R$ 2.670,00 de custos fixos; apenas o saldo positivo é dividido
igualmente entre Caixa/investimento, Sócio A e Sócio B.

RN-022 o PIX Automático semestral possui exatamente seis ciclos; o pagamento imediato conta como ciclo 1
e nenhuma sétima cobrança pode ser emitida. RN-023 somente confirmação financeira do Asaas pode baixar uma
mensalidade automaticamente; gerar ou exibir QR Code não equivale a pagamento.

RN-024 uma cobrança Asaas em processamento ou recebida impede alteração manual incompatível da mensalidade.
Estorno integral reabre a mensalidade; estorno parcial retira a mensalidade dos repasses e exige conciliação
manual auditada. Tentativas remotas permanecem no histórico; somente uma pode estar ativa por mensalidade.

RN-025 o plano padrão deve estar ativo e ter periodicidade mensal. A cobrança de matrícula preserva plano,
competência e valor apresentados ao candidato; uma troca posterior do padrão não altera essa cobrança.

RN-025.1 aula avulsa de cadastro é um acesso financeiro a uma `Aula` exata, não uma liberação geral da
modalidade. O acordo é fixo em R$ 20,00 + R$ 80,00 = R$ 100,00 e fica indisponível se o plano padrão não
corresponder a R$ 100,00. Alunos avulsos legados, criados fora desse fluxo, preservam seu comportamento.

RN-026 ofensivas usam somente `Checkin.status = VALIDO` e a data civil da aula no fuso da academia.
RN-027 vários check-ins do mesmo aluno, modalidade e dia contam uma única vez para a ofensiva.
RN-028 uma falta só quebra a ofensiva quando o dia terminou e houve ao menos um check-in válido de outro
aluno na modalidade; o primeiro check-in do dia não pode quebrar antecipadamente quem treinará mais tarde.
RN-029 ofensivas de modalidades diferentes nunca são combinadas; os rankings usam a maior ofensiva histórica
e o ranking geral seleciona o maior recorde do aluno entre suas modalidades.
RN-030 correções retroativas e invalidações recalculam ofensiva atual e máxima, pois presença inválida não
pode sustentar recorde.
RN-031 o ranking de ofensivas ignora integralmente check-ins anteriores a 31/08/2026; a partir desse marco,
mantém as mesmas regras de dia ativo, quebra, deduplicação e independência por modalidade.

## 8. Requisitos não funcionais (RNF)

RNF-001 web responsivo · RNF-002 experiência mobile do aluno · RNF-003 performance em telas críticas ·
RNF-004 segurança (autenticação usuário+senha, sessão, RBAC por papel, proteção de acesso, criptografia em
trânsito) · RNF-005 privacidade/LGPD · RNF-006 auditoria · RNF-007 backup · RNF-008 escalabilidade ·
RNF-009 disponibilidade · RNF-010 usabilidade (ações principais simples e rápidas).

## 9. Critérios de aceite (CA)

CA-001 cadastro de aluno · CA-002 tipos válidos · CA-003 agendamento na janela · CA-004 janela de 24h ·
CA-005 check-in registra data/hora/aluno/aula · CA-006 check-in gera presença · CA-007 contagem de horas
(1h30 → +1h30 geral e modalidade) · CA-008 invalidação remove presença e estorna horas · CA-009 auditoria da
invalidação · CA-010 mensalista inadimplente aplica regra configurada · CA-011/012 Wellhub/TotalPass sem API
e check-in do aluno exige confirmação prévia no aplicativo externo ·
CA-013/014 importação concilia com histórico · CA-015 registro não conciliado → pendente · CA-016 conciliação
manual com log · CA-017 check-in invalidado sinaliza divergência · CA-018 graduação atualiza atual + histórico.

CA-019 check-ins válidos em segunda, quarta, sexta e segunda seguinte exibem 1, 3, 5 e 8 dias ·
CA-020 se ninguém treinar em um feriado, nenhuma ofensiva da modalidade quebra · CA-021 se ao menos um aluno
treinar e outro faltar, a ofensiva do ausente zera após o fechamento do dia e preserva o recorde válido ·
CA-022 aluno multimodal visualiza ofensivas separadas, ranking geral, ranking por modalidade e sua posição;
após quebrar uma ofensiva de 50 dias e iniciar outra de 1, 2 ou 5 dias, continua classificado pelos 50 dias.

## 10. Fluxos principais

Mensalista/Wellhub/TotalPass/Avulso seguem: cadastro → grade → agendamento → check-in → presença → horas;
professor invalida nas exceções. Wellhub/TotalPass adicionam importação + conciliação. Graduação: professor
avalia → registra → atualiza atual + histórico. Importação: selecionar plataforma → importar CSV/XLSX →
identificar alunos → comparar com check-ins → classificar status → revisar/resolver → log.
