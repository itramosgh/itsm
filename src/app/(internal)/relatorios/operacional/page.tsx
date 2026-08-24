import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { AutoRefresh } from '@/components/ui/AutoRefresh'
import { offsetIso, offsetDateOnly } from '@/lib/date-math'

export default async function DashboardOperacionalPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; stale?: string }>
}) {
  const { from, to, stale } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const fromDate = from ?? offsetDateOnly(-30 * 86_400_000)
  const toDate = to ?? new Date().toISOString().slice(0, 10)
  const staleDays = parseInt(stale ?? '5', 10)

  const staleThreshold = offsetIso(-staleDays * 86_400_000)
  const today = new Date().toISOString().slice(0, 10)
  const in30 = offsetDateOnly(30 * 86_400_000)
  const in60 = offsetDateOnly(60 * 86_400_000)
  const in90 = offsetDateOnly(90 * 86_400_000)

  const [
    { data: ticketsRaw },
    { data: staleRaw },
    { data: contractsRaw },
  ] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, status, sla_met, sla_first_response_at, created_at, priority, category_id, assigned_to, company_id, ticket_categories(name), profiles!assigned_to(full_name), companies(name)')
      .gte('created_at', `${fromDate}T00:00:00Z`)
      .lte('created_at', `${toDate}T23:59:59Z`)
      .limit(2000) as any,
    supabase
      .from('tickets')
      .select('id, number, title, updated_at, companies(name), profiles!assigned_to(full_name)')
      .not('status', 'in', '("fechado","resolvido")')
      .lt('updated_at', staleThreshold)
      .order('updated_at')
      .limit(20),
    supabase
      .from('contracts')
      .select('id, end_date, companies(name)')
      .eq('status', 'ativo')
      .not('end_date', 'is', null)
      .gte('end_date', today)
      .lte('end_date', in90)
      .order('end_date'),
  ]) as [{ data: any[] | null }, { data: any[] | null }, { data: any[] | null }]

  const tickets = ticketsRaw ?? []
  const staleTickets = staleRaw ?? []
  const contracts = contractsRaw ?? []

  const statusCounts = tickets.reduce((acc: Record<string, number>, t: any) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1
    return acc
  }, {})

  const slaTickets = tickets.filter((t: any) => t.sla_met !== null)
  const slaMet = slaTickets.filter((t: any) => t.sla_met === true).length
  const slaBreached = slaTickets.filter((t: any) => t.sla_met === false).length
  const slaPerc = slaTickets.length > 0 ? Math.round((slaMet / slaTickets.length) * 100) : null

  const withResponse = tickets.filter((t: any) => t.sla_first_response_at)
  const avgResponseH = withResponse.length > 0
    ? withResponse.reduce((acc: number, t: any) => {
        return acc + (new Date(t.sla_first_response_at).getTime() - new Date(t.created_at).getTime())
      }, 0) / withResponse.length / 3_600_000
    : null

  const reopened = tickets.filter((t: any) => t.status === 'reaberto').length
  const reopenRate = tickets.length > 0 ? Math.round((reopened / tickets.length) * 100) : 0

  const catMap: Record<string, number> = {}
  tickets.forEach((t: any) => {
    const cat = (t.ticket_categories as any)?.name ?? 'Sem categoria'
    catMap[cat] = (catMap[cat] ?? 0) + 1
  })
  const categoryDist = Object.entries(catMap).sort(([, a], [, b]) => b - a)

  const prioMap: Record<string, number> = {}
  tickets.forEach((t: any) => { prioMap[t.priority] = (prioMap[t.priority] ?? 0) + 1 })

  const expiring30 = contracts.filter((c: any) => c.end_date <= in30)
  const expiring60 = contracts.filter((c: any) => c.end_date > in30 && c.end_date <= in60)
  const expiring90 = contracts.filter((c: any) => c.end_date > in60 && c.end_date <= in90)

  const statusLabels: Record<string, string> = {
    aberto: 'Abertos', em_andamento: 'Em andamento', aguardando_cliente: 'Ag. cliente',
    aguardando_fornecedor: 'Ag. fornecedor', resolvido: 'Resolvidos',
    fechado: 'Fechados', reaberto: 'Reabertos',
  }

  return (
    <div className="space-y-8">
      <AutoRefresh intervalSeconds={30} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Dashboard Operacional</h1>
        <form className="flex gap-2 items-end flex-wrap">
          <div className="space-y-1">
            <label className="text-xs font-medium">De</label>
            <input type="date" name="from" defaultValue={fromDate}
              className="border rounded-md px-3 py-1.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Até</label>
            <input type="date" name="to" defaultValue={toDate}
              className="border rounded-md px-3 py-1.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Sem atualizações (dias)</label>
            <input type="number" name="stale" defaultValue={staleDays} min={1} max={30}
              className="border rounded-md px-3 py-1.5 text-sm w-20" />
          </div>
          <button type="submit"
            className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm h-fit">
            Filtrar
          </button>
        </form>
      </div>

      {/* Status counts */}
      <section>
        <h2 className="text-base font-medium mb-3">Chamados por status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(statusLabels).map(([key, label]) => (
            <div key={key} className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1">{statusCounts[key] ?? 0}</p>
            </div>
          ))}
          <div className="border rounded-lg p-4 bg-muted/30">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold mt-1">{tickets.length}</p>
          </div>
        </div>
      </section>

      {/* SLA */}
      <section>
        <h2 className="text-base font-medium mb-3">SLA e Tempo de Resposta</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">SLA cumprido</p>
            <p className="text-2xl font-bold mt-1 text-green-600">
              {slaPerc !== null ? `${slaPerc}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{slaMet} chamados</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">SLA violado</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{slaBreached}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Tempo médio 1ª resposta</p>
            <p className="text-2xl font-bold mt-1">
              {avgResponseH !== null ? `${avgResponseH.toFixed(1)}h` : '—'}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Taxa de reabertura</p>
            <p className="text-2xl font-bold mt-1">{reopenRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{reopened} chamados</p>
          </div>
        </div>
      </section>

      {/* Distribuição */}
      <div className="grid grid-cols-2 gap-6">
        <section>
          <h2 className="text-base font-medium mb-3">Por prioridade</h2>
          <div className="space-y-2">
            {(['critica', 'alta', 'media', 'baixa'] as const).map((p) => {
              const count = prioMap[p] ?? 0
              const pct = tickets.length > 0 ? Math.round((count / tickets.length) * 100) : 0
              const colors: Record<string, string> = {
                critica: 'bg-red-500', alta: 'bg-orange-400',
                media: 'bg-yellow-400', baixa: 'bg-blue-400',
              }
              return (
                <div key={p}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{p}</span>
                    <span className="text-muted-foreground">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${colors[p]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="text-base font-medium mb-3">Por categoria</h2>
          <div className="space-y-1">
            {categoryDist.slice(0, 8).map(([cat, count]) => (
              <div key={cat} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span className="truncate">{cat}</span>
                <span className="font-medium shrink-0 ml-4">{count}</span>
              </div>
            ))}
            {categoryDist.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
            )}
          </div>
        </section>
      </div>

      {/* Chamados sem atualização */}
      {staleTickets.length > 0 && (
        <section>
          <h2 className="text-base font-medium mb-3">
            Chamados sem atualização há mais de {staleDays} dias
          </h2>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Chamado</th>
                  <th className="text-left px-4 py-3 font-medium">Empresa</th>
                  <th className="text-left px-4 py-3 font-medium">Analista</th>
                  <th className="text-left px-4 py-3 font-medium">Última atualização</th>
                </tr>
              </thead>
              <tbody>
                {(staleTickets as any[]).map((t: any) => (
                  <tr key={t.id} className="border-t hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link href={`/chamados/${t.id}`} className="hover:underline">
                        #{t.number} — {t.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{(t.companies as any)?.name ?? '—'}</td>
                    <td className="px-4 py-3">{(t.profiles as any)?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(t.updated_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Contratos próximos do vencimento */}
      {contracts.length > 0 && (
        <section>
          <h2 className="text-base font-medium mb-3">Contratos próximos do vencimento</h2>
          <div className="space-y-4">
            {expiring30.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-600 mb-2">
                  Vencendo em até 30 dias ({expiring30.length})
                </h3>
                <div className="space-y-1">
                  {(expiring30 as any[]).map((c: any) => (
                    <div key={c.id} className="flex justify-between text-sm border rounded px-4 py-2 bg-red-50">
                      <span>{(c.companies as any)?.name}</span>
                      <span className="font-medium">{new Date(c.end_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {expiring60.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-orange-600 mb-2">
                  Vencendo em 31–60 dias ({expiring60.length})
                </h3>
                <div className="space-y-1">
                  {(expiring60 as any[]).map((c: any) => (
                    <div key={c.id} className="flex justify-between text-sm border rounded px-4 py-2 bg-orange-50">
                      <span>{(c.companies as any)?.name}</span>
                      <span className="font-medium">{new Date(c.end_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {expiring90.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-yellow-700 mb-2">
                  Vencendo em 61–90 dias ({expiring90.length})
                </h3>
                <div className="space-y-1">
                  {(expiring90 as any[]).map((c: any) => (
                    <div key={c.id} className="flex justify-between text-sm border rounded px-4 py-2 bg-yellow-50">
                      <span>{(c.companies as any)?.name}</span>
                      <span className="font-medium">{new Date(c.end_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
