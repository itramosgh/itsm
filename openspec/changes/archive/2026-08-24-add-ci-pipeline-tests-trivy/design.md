## Context

Repo Next.js sem CI hoje. Testes (Vitest, `tests/`) usam `.env.test.local` via dotenv e testes de integração dependem de Supabase local rodando (CLAUDE.md). Não há `engines` fixado em `package.json` nem `.nvmrc`. Ver proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Pipeline único (`.github/workflows/ci.yml`) com dois jobs paralelos: `test` e `trivy`.
- Job `test` sobe Supabase local via `supabase` CLI + Docker (runner `ubuntu-latest` já tem Docker), aplica migrations, roda lint e Vitest.
- Job `trivy` roda scan de filesystem (`fs`) sobre o repo, sem precisar de build/imagem Docker da aplicação.

**Non-Goals:**
- Branch protection rules (exigir status check antes de merge) — configuração manual no GitHub, fora do escopo deste change.
- Deploy automático, build de imagem Docker da aplicação, ou publicação de artefatos.
- Scan de imagem de container (a aplicação não é containerizada hoje) — só scan de filesystem/dependências.

## Decisions

**Node version:** fixar `node-version: 22` no `actions/setup-node`, com `cache: npm`. Repo não pinava versão; testado com 20 primeiro, mas `@supabase/realtime-js` (via `@supabase/supabase-js`) exige WebSocket nativo — ausente no Node 20, presente a partir do Node 22. 22 também é a LTS mais próxima do Node 24 usado em dev local.
Alternativa considerada: usar `.nvmrc` — descartada porque não existe hoje e criar um está fora do escopo pedido (só pipeline).

**Subir Supabase no CI:** usar `supabase/setup-cli@v1` action + `supabase start`. As chaves anon/service role locais do Supabase CLI são valores fixos e públicos (mesmos em qualquer máquina), documentados no `.env.test.local` — não são segredo real, então podem ser hardcoded no workflow como env do job de teste em vez de exigir GitHub Secret.
Alternativa considerada: mockar Supabase — descartada, decisão do usuário foi rodar Supabase local de verdade.

**Trivy scan mode:** `aquasecurity/trivy-action` com `scan-type: fs`, `scan-ref: .`, `severity: CRITICAL,HIGH`, `exit-code: 1`. Ignora `node_modules` via `.trivyignore`/skip-dirs se necessário para performance.
Alternativa considerada: `scan-type: repo` (mesma coisa via clone remoto) — descartada, `fs` no checkout já disponível é mais rápido.

**Dois jobs separados vs um job sequencial:** jobs `test` e `trivy` como entradas independentes do workflow (`jobs:` no mesmo YAML, sem `needs:` entre eles) para satisfazer requirement de execução paralela/independente do spec.

## Risks / Trade-offs

[Supabase local demora para subir (~1-2 min) e pode falhar por instabilidade de Docker no runner] → Adicionar timeout razoável no step e permitir re-run manual; não bloqueia o job de segurança que roda em paralelo.

[Vulnerabilidades HIGH em dependências transitivas já existentes podem quebrar o primeiro run do pipeline] → Aceitável: força o time a triar/atualizar ou adicionar exceção pontual via `.trivyignore` com justificativa, é o comportamento pretendido.

[Chaves locais do Supabase hardcoded no workflow] → São valores públicos e fixos do Supabase CLI para ambiente local, não concedem acesso a nenhum ambiente real; sem risco de vazamento de segredo.
