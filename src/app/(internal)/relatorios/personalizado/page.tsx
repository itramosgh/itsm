import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { fmtDate } from '@/lib/format-date'
import { offsetDateOnly } from '@/lib/date-math'

const PAGE_SIZE = 50

const PRIORITY_LABELS: Record<string, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa',
}
const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto', em_andamento: 'Em andamento', aguardando_cliente: 'Ag. cliente',
  aguardando_fornecedor: 'Ag. fornecedor', aguardando_aprovacao: 'Ag. aprovação',
  em_mudanca: 'Em mudança', agendado: 'Agendado', em_deslocamento: 'Em deslocamento',
  resolvido: 'Resolvido', fechado: 'Fechado', reaberto: 'Reaberto',
}
const PRIORITY_COLORS: Record<string, string> = {
  critica: 'bg-red-100 text-red-800', alta: 'bg-orange-100 text-orange-800',
  media: 'bg-yellow-100 text-yellow-800', baixa: 'bg-blue-100 text-blue-800',
}

export default async function RelatorioPersonalizadoPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string; to?: string; company_id?: string; category_id?: string
    assigned_to?: string; priority?: string; contact_id?: string; page?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const fromDate = params.from ?? offsetDateOnly(-30 * 86_400_000)
  const toDate = params.to ?? new Date().toISOString().slice(0, 10)
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const rangeFrom = (page - 1) * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE - 1

  function applyFilters(q: any) {
    q = q
      .gte('created_at', `${fromDate}T00:00:00Z`)
      .lte('created_at', `${toDate}T23:59:59Z`)
    if (params.company_id)  q = q.eq('company_id', params.company_id)
    if (params.category_id) q = q.eq('category_id', params.category_id)
    if (params.assigned_to) q = q.eq('assigned_to', params.assigned_to)
    if (params.priority)    q = q.eq('priority', params.priority)
    if (params.contact_id)  q = q.eq('contact_id', params.contact_id)
    return q
  }

  const [
    { data: companies },
    { data: categories },
    { data: analysts },
    { data: contacts },
    kpiResult,
    tableResult,
  ] = await Promise.all([
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
    supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('contacts').select('id, full_name').eq('is_active', true).order('full_name'),
    // KPI query: lightweight fields only, up to 5000 for aggregate accuracy
    applyFilters(
      (supabase as any).from('tickets').select(
        'id, status, priority, sla_met, sla_deadline, updated_at, created_at, closed_at'
      )
    ).limit(5000) as Promise<{ data: any[] | null }>,
    // Table query: paginated with joins and exact count
    applyFilters(
      (supabase as any).from('tickets').select(`
        id, number, title, priority, status, sla_met, sla_deadline, updated_at,
        created_at, closed_at,
        companies(name),
        contacts!contact_id(full_name),
        ticket_categories(name),
        profiles!assigned_to(full_name)
      `, { count: 'exact' })
    ).order('created_at', { ascending: false }).range(rangeFrom, rangeTo) as Promise<{ data: any[] | null; count: number | null }>,
  ])

  const kpiTickets: any[] = (kpiResult as any).data ?? []
  const tickets: any[] = (tableResult as any).data ?? []
  const totalCount: number = (tableResult as any).count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const FINAL_STATUSES = ['resolvido', 'fechado', 'reaberto']

  function effectiveSLAMet(t: any): boolean | null {
    if (t.sla_met !== null) return t.sla_met
    if (!t.sla_deadline) return null
    if (FINAL_STATUSES.includes(t.status)) {
      return new Date(t.updated_at ?? t.created_at) <= new Date(t.sla_deadline)
    }
    return null
  }

  // KPIs computed from the full (non-paginated) dataset
  const slaTickets = kpiTickets.filter(t => effectiveSLAMet(t) !== null)
  const slaMet = slaTickets.filter(t => effectiveSLAMet(t) === true).length
  const slaPerc = slaTickets.length > 0 ? Math.round((slaMet / slaTickets.length) * 100) : null

  const closedTickets = kpiTickets.filter(t => t.status === 'fechado' && t.closed_at)
  const avgResolutionH = closedTickets.length > 0
    ? closedTickets.reduce((acc, t) =>
        acc + (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()), 0
      ) / closedTickets.length / 3_600_000
    : null

  const byStatus = kpiTickets.reduce((acc: Record<string, number>, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1
    return acc
  }, {})
  const byPriority = kpiTickets.reduce((acc: Record<string, number>, t) => {
    acc[t.priority] = (acc[t.priority] ?? 0) + 1
    return acc
  }, {})

  // Build URL helper preserving all filters
  function pageUrl(p: number) {
    const sp = new URLSearchParams()
    sp.set('from', fromDate)
    sp.set('to', toDate)
    if (params.company_id)  sp.set('company_id', params.company_id)
    if (params.category_id) sp.set('category_id', params.category_id)
    if (params.assigned_to) sp.set('assigned_to', params.assigned_to)
    if (params.priority)    sp.set('priority', params.priority)
    if (params.contact_id)  sp.set('contact_id', params.contact_id)
    if (p > 1) sp.set('page', String(p))
    return `/relatorios/personalizado?${sp}`
  }

  const csvParams = new URLSearchParams()
  csvParams.set('from', fromDate)
  csvParams.set('to', toDate)
  if (params.company_id)  csvParams.set('company_id', params.company_id)
  if (params.category_id) csvParams.set('category_id', params.category_id)
  if (params.assigned_to) csvParams.set('assigned_to', params.assigned_to)
  if (params.priority)    csvParams.set('priority', params.priority)
  if (params.contact_id)  csvParams.set('contact_id', params.contact_id)

  const hasFilters = !!(params.company_id || params.category_id || params.assigned_to || params.priority || params.contact_id)

  // Page numbers to render (max 7 visible)
  function visiblePages(current: number, total: number): (number | '…')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const pages: (number | '…')[] = [1]
    if (current > 3) pages.push('…')
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
    if (current < total - 2) pages.push('…')
    pages.push(total)
    return pages
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Relatório Personalizado</h1>
          <p className="text-sm text-muted-foreground mt-1">Filtre e exporte chamados por qualquer combinação de critérios</p>
        </div>
        <a
          href={`/api/reports/personalizado/csv?${csvParams}`}
          className="text-sm border rounded-md px-4 py-2 hover:bg-muted whitespace-nowrap"
        >
          Exportar CSV
        </a>
      </div>

      {/* Filters */}
      <form method="GET" className="rounded-lg border p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">De</label>
            <input type="date" name="from" defaultValue={fromDate}
              className="mt-1 block w-full border rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Até</label>
            <input type="date" name="to" defaultValue={toDate}
              className="mt-1 block w-full border rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cliente</label>
            <select name="company_id" defaultValue={params.company_id ?? ''}
              className="mt-1 block w-full border rounded-md px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {(companies ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Categoria</label>
            <select name="category_id" defaultValue={params.category_id ?? ''}
              className="mt-1 block w-full border rounded-md px-2 py-1.5 text-sm">
              <option value="">Todas</option>
              {(categories ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Analista</label>
            <select name="assigned_to" defaultValue={params.assigned_to ?? ''}
              className="mt-1 block w-full border rounded-md px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {(analysts ?? []).map((a: any) => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Prioridade</label>
            <select name="priority" defaultValue={params.priority ?? ''}
              className="mt-1 block w-full border rounded-md px-2 py-1.5 text-sm">
              <option value="">Todas</option>
              {(['critica', 'alta', 'media', 'baixa'] as const).map(p => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Solicitante</label>
            <select name="contact_id" defaultValue={params.contact_id ?? ''}
              className="mt-1 block w-full border rounded-md px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {(contacts ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit"
              className="flex-1 bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm">
              Filtrar
            </button>
            {hasFilters && (
              <Link href="/relatorios/personalizado"
                className="text-sm border rounded-md px-3 py-1.5 hover:bg-muted">
                Limpar
              </Link>
            )}
          </div>
        </div>
      </form>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Total de chamados</p>
          <p className="text-3xl font-bold mt-1">{totalCount}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">SLA cumprido</p>
          <p className={`text-3xl font-bold mt-1 ${slaPerc !== null ? (slaPerc >= 80 ? 'text-green-600' : 'text-red-600') : ''}`}>
            {slaPerc !== null ? `${slaPerc}%` : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{slaMet} de {slaTickets.length} avaliados</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Tempo médio de resolução</p>
          <p className="text-3xl font-bold mt-1">
            {avgResolutionH !== null
              ? avgResolutionH >= 24
                ? `${(avgResolutionH / 24).toFixed(1)}d`
                : `${avgResolutionH.toFixed(1)}h`
              : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{closedTickets.length} fechados</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Abertos / Em andamento</p>
          <p className="text-3xl font-bold mt-1">
            {(byStatus['aberto'] ?? 0) + (byStatus['em_andamento'] ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {byStatus['aberto'] ?? 0} abertos · {byStatus['em_andamento'] ?? 0} em andamento
          </p>
        </div>
      </div>

      {/* Status + Priority breakdown */}
      {totalCount > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Por status</p>
            <div className="space-y-1.5">
              {Object.entries(byStatus).sort(([, a], [, b]) => b - a).map(([status, count]) => (
                <div key={status} className="flex justify-between text-sm">
                  <span>{STATUS_LABELS[status] ?? status}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Por prioridade</p>
            <div className="space-y-1.5">
              {(['critica', 'alta', 'media', 'baixa'] as const).filter(p => byPriority[p]).map(p => (
                <div key={p} className="flex justify-between text-sm">
                  <span>{PRIORITY_LABELS[p]}</span>
                  <span className="font-medium">{byPriority[p]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ticket table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">
            {totalCount === 0
              ? 'Nenhum chamado encontrado'
              : `${rangeFrom + 1}–${Math.min(rangeTo + 1, totalCount)} de ${totalCount} chamado${totalCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        {totalCount > 0 && (
          <>
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">#</th>
                      <th className="text-left px-4 py-3 font-medium">Título</th>
                      <th className="text-left px-4 py-3 font-medium">Cliente</th>
                      <th className="text-left px-4 py-3 font-medium">Solicitante</th>
                      <th className="text-left px-4 py-3 font-medium">Categoria</th>
                      <th className="text-left px-4 py-3 font-medium">Analista</th>
                      <th className="text-left px-4 py-3 font-medium">Prioridade</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-left px-4 py-3 font-medium">SLA</th>
                      <th className="text-left px-4 py-3 font-medium">Criado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map(t => (
                      <tr key={t.id} className="border-t hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/chamados/${t.id}`} className="hover:underline">
                            #{t.number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 max-w-[200px] truncate">
                          <Link href={`/chamados/${t.id}`} className="hover:underline">
                            {t.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{t.companies?.name ?? '—'}</td>
                        <td className="px-4 py-3">{t.contacts?.full_name ?? '—'}</td>
                        <td className="px-4 py-3">{t.ticket_categories?.name ?? '—'}</td>
                        <td className="px-4 py-3">{t.profiles?.full_name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[t.priority] ?? ''}`}>
                            {PRIORITY_LABELS[t.priority] ?? t.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">{STATUS_LABELS[t.status] ?? t.status}</td>
                        <td className="px-4 py-3">
                          {(() => {
                            const sla = effectiveSLAMet(t)
                            if (sla === null) return <span className="text-muted-foreground">—</span>
                            return sla
                              ? <span className="text-green-600 font-medium">✓</span>
                              : <span className="text-red-600 font-medium">✗</span>
                          })()}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-4">
                <Link
                  href={pageUrl(page - 1)}
                  aria-disabled={page === 1}
                  className={`px-3 py-1.5 text-sm border rounded-md ${page === 1 ? 'pointer-events-none opacity-40' : 'hover:bg-muted'}`}
                >
                  ‹
                </Link>
                {visiblePages(page, totalPages).map((p, i) =>
                  p === '…'
                    ? <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-sm text-muted-foreground">…</span>
                    : (
                      <Link
                        key={p}
                        href={pageUrl(p)}
                        className={`px-3 py-1.5 text-sm border rounded-md ${p === page ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                      >
                        {p}
                      </Link>
                    )
                )}
                <Link
                  href={pageUrl(page + 1)}
                  aria-disabled={page === totalPages}
                  className={`px-3 py-1.5 text-sm border rounded-md ${page === totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-muted'}`}
                >
                  ›
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
