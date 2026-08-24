## 1. Workflow base

- [x] 1.1 Criar `.github/workflows/ci.yml` com triggers `push` (branch `main`) e `pull_request` (base `main`) e verificar que o arquivo é YAML válido (`actionlint` ou lint do próprio GitHub ao commitar)
- [x] 1.2 Definir os dois jobs `test` e `trivy` sem `needs` entre eles e verificar no Actions que ambos aparecem e rodam em paralelo

## 2. Job de testes unitários

- [x] 2.1 Adicionar steps de checkout, `actions/setup-node@v4` (node-version 20, cache npm) e `npm ci` e verificar que a instalação completa sem erro no log do job
- [x] 2.2 Adicionar step `supabase/setup-cli@v1` + `supabase start` (com `--ignore-health-check` conforme script `supabase:start` do projeto) e verificar que o step reporta Supabase local rodando
- [x] 2.3 Gerar/expor `.env.test.local` no job com as chaves locais fixas do Supabase CLI (URL, anon key, service role key) e verificar que `npm run test` consegue conectar (sem erro de conexão nos logs)
- [x] 2.4 Adicionar steps `npm run lint` e `npm run test` e verificar que o job falha quando um teste é quebrado propositalmente em um branch de teste, e passa quando a suíte está íntegra

## 3. Job de segurança Trivy

- [x] 3.1 Adicionar step `aquasecurity/trivy-action@master` com `scan-type: fs`, `scan-ref: .`, `severity: CRITICAL,HIGH`, `exit-code: 1` e verificar que o job roda e produz relatório no log
- [x] 3.2 Excluir diretórios irrelevantes do scan (`node_modules`, `.next`) via `skip-dirs` e verificar que o tempo de execução do job cai e não há falso positivo vindo de dependências já instaladas localmente
- [ ] 3.3 Verificar que o job falha propositalmente introduzindo uma dependência com CVE conhecida (teste manual único, revertido depois) e passa em estado normal do repo

## 4. Validação final

- [ ] 4.1 Abrir um pull request de teste e verificar que os dois checks (`test`, `trivy`) aparecem no PR e refletem o resultado real de cada job
- [x] 4.2 Confirmar com `openspec validate --change add-ci-pipeline-tests-trivy --strict` que o change está consistente antes de arquivar
