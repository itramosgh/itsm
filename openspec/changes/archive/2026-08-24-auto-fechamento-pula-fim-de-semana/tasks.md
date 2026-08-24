## 1. Helper de dias úteis

- [x] 1.1 Implementar `addBusinessDays(start, hours, businessDays, holidays)` em `src/lib/sla.ts`, reaproveitando `isBusinessDay`/helpers de timezone SP já existentes, e exportar a função
- [x] 1.2 Adicionar casos de teste em `tests/sla.test.ts`: início numa sexta 17h + 24h/48h pula fim de semana; feriado emendado com fim de semana é descontado; início num dia útil no meio da semana não é afetado; verificar rodando `npx vitest run tests/sla.test.ts`

## 2. Cron `aguardando_cliente`

- [x] 2.1 Ampliar a query de `platform_settings` no cron para trazer `business_hours_days`, e buscar `holidays` num intervalo que cubra do menor `updated_at` relevante até hoje
- [x] 2.2 Incluir `contracts(is_24x7)` no select de `tickets` via `contract_id` (tratar `contract_id` nulo como não-24x7, conforme spec)
- [x] 2.3 Substituir a comparação de `hoursSinceUpdate >= 24/48` por `addBusinessDays` para chamados não-24x7, mantendo a lógica corrida atual para 24x7 — verificar que o `if/else` cobre os dois casos sem duplicar o corpo do envio de e-mail/log
- [x] 2.4 Rodar `npm run test` local e validar manualmente com `npm run dev` + dados de teste (chamado com `updated_at` de sexta-feira) que o lembrete e o fechamento não disparam antes do dia útil esperado

## 3. Cron `aguardando_aprovacao`

- [x] 3.1 Trocar o filtro SQL exato (`created_at < now - 48h`) por uma janela larga (ex: 7 dias) na query de `ticket_approvals`, mantendo `status = 'pendente'`
- [x] 3.2 Incluir `contracts(is_24x7)` no join via `tickets.contract_id` na mesma query
- [x] 3.3 Calcular o deadline em JS com `addBusinessDays` (ou corrido, se 24x7) e filtrar antes de expirar/fechar — verificar que aprovação criada sexta-feira só expira depois do fim de semana em contrato não-24x7

## 4. Fechamento

- [x] 4.1 Rodar `npm run lint` e `npm run test` completos — `npm run lint` está quebrado neste projeto (Next 16 removeu `next lint` do CLI, gap pré-existente, não causado por esta mudança); rodado `npx tsc --noEmit` (sem erros) como substituto. `npm run test`: 290/291 passam, única falha (`email-notifications.test.ts`) é pré-existente e não relacionada (não toca `sla.ts`/`ticket-automations`)
- [x] 4.2 Revisar manualmente os dois blocos alterados em `route.ts` confirmando que nenhum outro fluxo do cron (billing, gestores, e-mails) foi afetado
