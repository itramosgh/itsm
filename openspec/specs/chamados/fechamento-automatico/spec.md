## Purpose

Define como o sistema mede o tempo de espera de um chamado em `aguardando_cliente` ou com aprovação pendente (`aguardando_aprovacao`), para lembrete e fechamento/expiração automáticos, respeitando dias não-úteis.

## Requirements

### Requirement: Contagem de espera do cliente ignora dia não-útil
Para chamados em contrato que não é 24x7, o tempo decorrido usado para disparar o lembrete de retorno e o fechamento automático em `aguardando_cliente` SHALL desconsiderar sábado, domingo (ou o que estiver fora de `platform_settings.business_hours_days`) e feriado cadastrado, contando 24h corridas apenas nos dias úteis.

#### Scenario: Chamado entra em espera na sexta-feira
- **WHEN** um chamado de contrato não-24x7 muda para `aguardando_cliente` na sexta-feira às 17h
- **THEN** o lembrete de 24h de espera dispara na segunda-feira às 17h, não no sábado

#### Scenario: Fechamento automático pula fim de semana
- **WHEN** um chamado de contrato não-24x7 está em `aguardando_cliente` desde sexta-feira às 17h e o cliente não responde
- **THEN** o chamado é fechado automaticamente na terça-feira às 17h (2 dias úteis depois), não no domingo

#### Scenario: Feriado emenda com fim de semana
- **WHEN** o período de espera de um chamado não-24x7 cruza um feriado cadastrado em `holidays` que emenda com fim de semana
- **THEN** o feriado também é descontado da contagem de 24h/48h

### Requirement: Contrato 24x7 mantém contagem corrida
Para chamados vinculados a contrato com `is_24x7 = true`, a contagem de tempo para lembrete e fechamento automático em `aguardando_cliente` SHALL permanecer em horas corridas, sem pular fim de semana ou feriado.

#### Scenario: Chamado 24x7 entra em espera na sexta-feira
- **WHEN** um chamado de contrato 24x7 muda para `aguardando_cliente` na sexta-feira às 17h
- **THEN** o fechamento automático ocorre no domingo às 17h (48h corridas), sem pular o fim de semana

### Requirement: Chamado sem contrato vinculado usa regra padrão
Um chamado sem `contract_id` preenchido SHALL ser tratado como não-24x7 para efeito de contagem de espera em `aguardando_cliente`.

#### Scenario: Chamado sem contrato
- **WHEN** um chamado com `contract_id` nulo entra em `aguardando_cliente`
- **THEN** a contagem de lembrete e fechamento pula fim de semana e feriado, igual a um contrato não-24x7

### Requirement: Expiração de aprovação pendente ignora dia não-útil
Para chamados de contrato não-24x7, o prazo de 48h para expirar uma aprovação pendente (`ticket_approvals.status = 'pendente'`) e fechar o chamado associado SHALL desconsiderar fim de semana e feriado, na mesma regra aplicada a `aguardando_cliente`. Contrato 24x7 mantém contagem corrida.

#### Scenario: Aprovação pendente criada na sexta-feira
- **WHEN** uma aprovação pendente de chamado não-24x7 é criada na sexta-feira às 17h e ninguém responde
- **THEN** a aprovação expira e o chamado é fechado na terça-feira às 17h, não no domingo
