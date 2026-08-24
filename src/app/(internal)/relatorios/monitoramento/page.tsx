import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { offsetDateOnly } from '@/lib/date-math'

const CHANNEL_LABELS: Record<string, string> = {
  zabbix: 'Zabbix',
  azure_monitor: 'Azure Monitor',
  url_monitoring: 'URL Monitoring',
}

const MONITORING_CHANNELS = ['zabbix', 'azure_monitor', 'url_monitoring']
const PAGE_SIZE = 50

export default async function DashboardMonitoramentoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; page?: string }>
}) {
  const { from, to, page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10))

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const fromDate = from ?? offsetDateOnly(-30 * 86_400_000)
  const toDate = to ?? new Date().toISOString().slice(0, 10)

  const [{ data: integrations }, { data: urls }] = await Promise.all([
    supabase.from('monitoring_integrations').select('id').eq('is_active', true).limit(1),
    supabase.from('monitored_urls').select('id').eq('is_active', true).limit(1),
  ]) as [{ data: any[] | null }, { data: any[] | null }]

  const hasMonitoring = (integrations?.length ?? 0) > 0 || (urls?.length ?? 0) > 0

  if (!hasMonitoring) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold">Dashboard de Monitoramento</h1>
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <p className="text-base">Nenhuma integração de monitoramento ativa.</p>
          <p className="text-sm mt-2">
            Configure integrações (Zabbix, Azure Monitor) ou URLs monitoradas nas telas de cliente.
          </p>
        </div>
      </div>
    )
  }

  const rangeFrom = (page - 1) * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE - 1

  function pageUrl(p: number) {
    const params = new URLSearchParams()
    params.set('from', fromDate)
    params.set('to', toDate)
    if (p > 1) params.set('page', String(p))
    return `/relatorios/monitoramento?${params.toString()}`
  }

  const [
    { data: kpiRaw },
    { data: tableRaw, count: totalCount },
  ] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, number, title, status, channel, created_at, closed_at, companies(name)')
      .in('channel', MONITORING_CHANNELS)
      .gte('created_at', `${fromDate}T00:00:00Z`)
      .lte('created_at', `${toDate}T23:59:59Z`)
      .limit(5000) as any,
    supabase
      .from('tickets')
      .select('id, number, title, status, channel, priority, created_at, closed_at, company_id, assigned_to, companies(name), profiles!assigned_to(full_name)', { count: 'exact' })
      .in('channel', MONITORING_CHANNELS)
      .gte('created_at', `${fromDate}T00:00:00Z`)
      .lte('created_at', `${toDate}T23:59:59Z`)
      .order('created_at', { ascending: false })
      .range(rangeFrom, rangeTo) as any,
  ])

  const tickets: any[] = kpiRaw ?? []
  const tableTickets: any[] = tableRaw ?? []
  const total = totalCount ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const closedTickets = tickets.filter((t: any) => t.closed_at)
  const mttrMs = closedTickets.length > 0
    ? closedTickets.reduce((acc: number, t: any) => {
        return acc + (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime())
      }, 0) / closedTickets.length
    : null
  const mttrHours = mttrMs !== null ? (mttrMs / 3_600_000) : null

  const openTickets = tickets.filter((t: any) =>
    !['fechado', 'resolvido'].includes(t.status)
  )

  const byChannel: Record<string, number> = {}
  tickets.forEach((t: any) => {
    byChannel[t.channel] = (byChannel[t.channel] ?? 0) + 1
  })

  const byCompany: Record<string, number> = {}
  tickets.forEach((t: any) => {
    const name = (t.companies as any)?.name ?? 'Desconhecido'
    byCompany[name] = (byCompany[name] ?? 0) + 1
  })
  const companyDist = Object.entries(byCompany).sort(([, a], [, b]) => b - a)

  const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    aberto: 'destructive',
    em_andamento: 'default',
    aguardando_cliente: 'outline',
    aguardando_fornecedor: 'outline',
    resolvido: 'secondary',
    fechado: 'secondary',
    reaberto: 'destructive',
  }

  function pageNumbers(current: number, totalPg: number): (number | '…')[] {
    if (totalPg <= 7) return Array.from({ length: totalPg }, (_, i) => i + 1)
    const pages: (number | '…')[] = [1]
    if (current > 3) pages.push('…')
    for (let p = Math.max(2, current - 1); p <= Math.min(totalPg - 1, current + 1); p++) pages.push(p)
    if (current < totalPg - 2) pages.push('…')
    pages.push(totalPg)
    return pages
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Dashboard de Monitoramento</h1>
        <form className="flex gap-2 items-end">
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
          <button type="submit"
            className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm h-fit">
            Filtrar
          </button>
        </form>
      </div>

      <section>
        <h2 className="text-base font-medium mb-3">Métricas do período</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Total de alertas</p>
            <p className="text-2xl font-bold mt-1">{tickets.length}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Resolvidos automaticamente</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{closedTickets.length}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Ainda abertos</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{openTickets.length}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">MTTR médio</p>
            <p className="text-2xl font-bold mt-1">
              {mttrHours !== null ? `${mttrHours.toFixed(1)}h` : '—'}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-base font-medium mb-3">Alertas por conector</h2>
        <div className="grid grid-cols-3 gap-3">
          {MONITORING_CHANNELS.map((ch) => (
            <div key={ch} className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{CHANNEL_LABELS[ch]}</p>
              <p className="text-2xl font-bold mt-1">{byChannel[ch] ?? 0}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-6">
        <section>
          <h2 className="text-base font-medium mb-3">Alertas por cliente</h2>
          {companyDist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta no período.</p>
          ) : (
            <div className="space-y-1">
              {companyDist.slice(0, 8).map(([name, count]) => (
                <div key={name} className="flex justify-between text-sm py-1 border-b last:border-0">
                  <span className="truncate">{name}</span>
                  <span className="font-medium shrink-0 ml-4">{count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-base font-medium mb-3">
            Chamados abertos ({openTickets.length})
          </h2>
          {openTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum chamado de monitoramento em aberto.</p>
          ) : (
            <div className="space-y-1">
              {openTickets.slice(0, 8).map((t: any) => (
                <Link
                  key={t.id}
                  href={`/chamados/${t.id}`}
                  className="flex items-center justify-between text-sm py-1 border-b last:border-0 hover:text-primary"
                >
                  <span className="truncate">
                    #{t.number} — {t.title}
                  </span>
                  <Badge variant={STATUS_VARIANT[t.status] ?? 'outline'} className="shrink-0 ml-2 text-xs">
                    {CHANNEL_LABELS[t.channel] ?? t.channel}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {total > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-medium">Todos os alertas do período</h2>
            <span className="text-sm text-muted-foreground">
              {rangeFrom + 1}–{Math.min(rangeTo + 1, total)} de {total} alertas
            </span>
          </div>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Chamado</th>
                  <th className="text-left px-4 py-3 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium">Conector</th>
                  <th className="text-left px-4 py-3 font-medium">Analista</th>
                  <th className="text-left px-4 py-3 font-medium">Abertura</th>
                  <th className="text-left px-4 py-3 font-medium">MTTR</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {tableTickets.map((t: any) => {
                  const resolveMs = t.closed_at
                    ? new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()
                    : null
                  const resolveH = resolveMs !== null ? (resolveMs / 3_600_000).toFixed(1) : '—'
                  return (
                    <tr key={t.id} className="border-t hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link href={`/chamados/${t.id}`} className="hover:underline">
                          #{t.number} — {t.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{(t.companies as any)?.name ?? '—'}</td>
                      <td className="px-4 py-3">{CHANNEL_LABELS[t.channel] ?? t.channel}</td>
                      <td className="px-4 py-3">{(t.profiles as any)?.full_name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">{resolveH}{resolveMs !== null ? 'h' : ''}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[t.status] ?? 'outline'}>
                          {t.status}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-4">
              <Link
                href={pageUrl(page - 1)}
                aria-disabled={page <= 1}
                className={`px-3 py-1.5 rounded text-sm border ${page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-muted'}`}
              >
                ←
              </Link>
              {pageNumbers(page, totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-sm text-muted-foreground">…</span>
                ) : (
                  <Link
                    key={p}
                    href={pageUrl(p as number)}
                    className={`px-3 py-1.5 rounded text-sm border ${p === page ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                  >
                    {p}
                  </Link>
                )
              )}
              <Link
                href={pageUrl(page + 1)}
                aria-disabled={page >= totalPages}
                className={`px-3 py-1.5 rounded text-sm border ${page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-muted'}`}
              >
                →
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
