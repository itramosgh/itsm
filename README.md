# ITSM ITRAMOS

Sistema B2B de gestão de chamados (ITSM). Interface interna para admin/gestor/analista + portal self-service para clientes externos.

## Stack

- **Next.js 16** (App Router)
- **Supabase** (Postgres + Auth + RLS)
- **Resend** (envio de e-mail)
- **TypeScript**, **Zod v4** (validação), **Tailwind CSS**, **shadcn/ui** (Radix)
- **Vitest** (testes)

## Setup local

1. Instalar dependências:
   ```bash
   npm install
   ```
2. Criar `.env.local` com as variáveis abaixo (ver seção "Env vars").
3. Subir o Supabase local (opcional, necessário para testes de integração):
   ```bash
   npm run supabase:start
   ```
4. Rodar o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

### Env vars

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
NEXT_PUBLIC_APP_URL
```

Testes usam `.env.test.local` (carregado automaticamente via dotenv em `tests/setup.ts`).

## Estrutura de rotas

| Grupo | Path prefix | Quem acessa |
|---|---|---|
| `(internal)` | `/dashboard`, `/chamados`, `/clientes`, `/usuarios`, `/configuracoes` | admin, gestor, analista |
| `(portal)` | `/portal/*` | clientes externos |
| `(auth)` | `/login` | login interno |
| bare | `/aprovacao/[token]` | aprovadores externos (sem auth) |
| `api` | `/api/cron/*`, `/api/tickets/*`, `/api/upload/*` | webhooks e crons |

O middleware separa as duas áreas: usuário interno tentando acessar `/portal` é redirecionado para `/dashboard`, e cliente de portal tentando acessar área interna é redirecionado para `/portal/chamados`.

## Testes

```bash
npm run test                        # roda todos
npx vitest run tests/sla.test.ts    # roda um arquivo específico
```

Testes de integração conectam ao Supabase local — rodar `npm run supabase:start` antes.

## Mais detalhes

Para arquitetura detalhada (state machine de chamados, SLA, templates de e-mail, padrões de Server Actions, etc.), ver [`CLAUDE.md`](./CLAUDE.md).
