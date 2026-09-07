# API pública de alunos graduados

A API disponibiliza os dados necessários para montar, em outro site, uma vitrine pública dos alunos
graduados da ECVO. Ela não exige autenticação nem chave de API e aceita requisições de qualquer origem
via CORS.

## Endpoint

```http
GET https://app.ecvo.com.br/api/publico/alunos-graduados
```

A resposta usa JSON e lista somente alunos que atendem simultaneamente a estes critérios:

- a conta do usuário está ativa;
- o status da matrícula é `ATIVO` ou `INADIMPLENTE` (ambos são status operacionais do sistema);
- existe ao menos uma graduação efetivamente registrada em `GraduacaoAluno`.

Graduações iniciais apenas inferidas a partir do catálogo da modalidade não aparecem no histórico. O
status financeiro do aluno não é exposto.

## Resposta de sucesso

```json
{
  "total": 1,
  "alunos": [
    {
      "nome": "Ana Silva",
      "fotoUrl": "https://app.ecvo.com.br/api/publico/alunos-graduados/cm123/foto",
      "graduacoes": [
        {
          "modalidade": "Jiu-Jitsu",
          "faixa": "Faixa azul",
          "dataGraduacao": "2026-08-30T18:00:00.000Z"
        }
      ]
    }
  ]
}
```

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `total` | número | Quantidade de alunos retornados. |
| `alunos[].nome` | texto | Nome público do atleta. |
| `alunos[].fotoUrl` | texto ou `null` | URL absoluta da foto; use uma imagem padrão quando for `null`. |
| `alunos[].graduacoes` | lista | Histórico em ordem cronológica, da graduação mais antiga para a mais recente. |
| `modalidade` | texto | Modalidade à qual a faixa ou nível pertence. |
| `faixa` | texto | Nome da graduação no catálogo da modalidade. |
| `dataGraduacao` | texto | Instante da concessão no formato ISO 8601, em UTC. |

Os alunos são ordenados alfabeticamente pelo nome. A resposta contém somente nome, foto e histórico de
graduações; CPF, e-mail, telefone, situação financeira, observações e demais dados internos nunca são
incluídos.

> A rota torna nome, foto e graduações dados públicos. Antes de ativar a integração na landing, a ECVO
> deve confirmar a base legal e as autorizações de uso de imagem aplicáveis aos atletas publicados.

## Exemplo de integração na landing page

```js
const resposta = await fetch("https://app.ecvo.com.br/api/publico/alunos-graduados")

if (!resposta.ok) {
  throw new Error("Não foi possível carregar os alunos graduados")
}

const { alunos } = await resposta.json()
```

Como `dataGraduacao` está em ISO 8601, a landing pode aplicar a apresentação desejada:

```js
const data = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
}).format(new Date(graduacao.dataGraduacao))
```

## Fotos, cache e erros

Fotos armazenadas no Vercel Blob continuam privadas no storage. Para alunos elegíveis à publicação, a
API retorna uma URL intermediária pública que entrega somente aquela foto. Se o aluno deixar de atender
aos critérios, essa URL passa a responder `404`. URLs externas já públicas são preservadas.

A listagem tem cache compartilhado de até 5 minutos. A API responde `500` com uma mensagem genérica se a
consulta falhar. O formato de erro é:

```json
{
  "erro": "Não foi possível carregar os alunos graduados."
}
```
