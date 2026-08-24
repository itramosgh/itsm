import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { fmtDate } from '@/lib/format-date'
import { offsetDateOnly } from '@/lib/date-math'

const PRIORITY_LABELS: Record<string, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa',
}
const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto', em_andamento: 'Em andamento', aguardando_cliente: 'Ag. cliente',
  aguardando_fornecedor: 'Ag. fornecedor', aguardando_aprovacao: 'Ag. aprovação',
  em_mudanca: 'Em mudança', agendado: 'Agendado', resolvido: 'Resolvido',
  fechado: 'Fechado', reaberto: 'Reaberto',
}
const PRIORITY_COLORS: Record<string, string> = {
  critica: 'bg-red-100 text-red-800', alta: 'bg-orange-100 text-orange-800',
  media: 'bg-yellow-100 text-yellow-800', baixa: 'bg-blue-100 text-blue-800',
}

export default async function PortalRelatorioPersonalizadoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; category_id?: string; priority?: string; contact_id?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: contact } = await supabase
    .from('contacts')
    .select('company_id, is_contract_responsible')
    .eq('user_id', user.id)
    .single() as { data: { company_id: string; is_contract_responsible: boolean } | null }

  if (!contact) notFound()
  if (!contact.is_contract_responsible) notFound()

  const companyId = contact.company_id
  const fromDate = params.from ?? offsetDateOnly(-30 * 86_400_000)
  const toDate = params.to ?? new Date().toISOString().slice(0, 10)

  const [{ data: categories }, { data: contacts }, ticketsResult] = await Promise.all([
    supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('name'),
    supabase.from('contacts').select('id, full_name').eq('company_id', companyId).eq('is_active', true).order('full_name'),
    (async () => {
      let q = (supabase as any)
        .from('tickets')
        .select('id, number, title, priority, status, sla_met, created_at, closed_at, contacts!contact_id(full_name), ticket_categories(name)')
        .eq('company_id', companyId)
        .gte('created_at', `${fromDate}T00:00:00Z`)
        .lte('created_at', `${toDate}T23:59:59Z`)
        .order('created_at', { ascending: false })
        .limit(2000)

      if (params.category_id) q = q.eq('category_id', params.category_id)
      if (params.priority)    q = q.eq('priority', params.priority)
      if (params.contact_id)  q = q.eq('contact_id', params.contact_id)

      return q
    })(),
  ])

  const tickets: any[] = ticketsResult?.data ?? []
  const total = tickets.length
  const slaTickets = tickets.filter(t => t.sla_met !== null)
  const slaMet = slaTickets.filter(t => t.sla_met === true).length
  const slaPerc = slaTickets.length > 0 ? Math.round((slaMet / slaTickets.length) * 100) : null
  const closedTickets = tickets.filter(t => t.status === 'fechado' && t.closed_at)
  const avgResolutionH = closedTickets.length > 0
    ? closedTickets.reduce((acc, t) => acc + (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()), 0)
      / closedTickets.length / 3_600_000
    : null
  const byStatus = tickets.reduce((acc: Record<string, number>, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1; return acc
  }, {})
  const byPriority = tickets.reduce((acc: Record<string, number>, t) => {
    acc[t.priority] = (acc[t.priority] ?? 0) + 1; return acc
  }, {})

  const hasFilters = !!(params.category_id || params.priority || params.contact_id)

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Relatório Personalizado</h1>

      {/* Filtros */}
      <form method="GET" className="rounded-lg border p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
        </div>
        <div className="flex gap-2">
          <button type="submit"
            className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm">
            Filtrar
          </button>
          {hasFilters && (
            <a href="/portal/relatorios/personalizado"
              className="text-sm border rounded-md px-3 py-1.5 hover:bg-muted">
              Limpar
            </a>
          )}
        </div>
      </form>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Total de chamados</p>
          <p className="text-3xl font-bold mt-1">{total}</p>
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
              ? avgResolutionH >= 24 ? `${(avgResolutionH / 24).toFixed(1)}d` : `${avgResolutionH.toFixed(1)}h`
              : '—'}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Abertos / Em andamento</p>
          <p className="text-3xl font-bold mt-1">
            {(byStatus['aberto'] ?? 0) + (byStatus['em_andamento'] ?? 0)}
          </p>
        </div>
      </div>

      {/* Distribuição */}
      {total > 0 && (
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

      {/* Tabela */}
      {total > 0 && (
        <div className="border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">#</th>
                  <th className="text-left px-4 py-3 font-medium">Título</th>
                  <th className="text-left px-4 py-3 font-medium">Solicitante</th>
                  <th className="text-left px-4 py-3 font-medium">Categoria</th>
                  <th className="text-left px-4 py-3 font-medium">Prioridade</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">SLA</th>
                  <th className="text-left px-4 py-3 font-medium">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id} className="border-t hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium">#{t.number}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{t.title}</td>
                    <td className="px-4 py-3">{t.contacts?.full_name ?? '—'}</td>
                    <td className="px-4 py-3">{t.ticket_categories?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[t.priority] ?? ''}`}>
                        {PRIORITY_LABELS[t.priority] ?? t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">{STATUS_LABELS[t.status] ?? t.status}</td>
                    <td className="px-4 py-3">
                      {t.sla_met === null ? '—' : t.sla_met
                        ? <span className="text-green-600 font-medium">✓</span>
                        : <span className="text-red-600 font-medium">✗</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {total === 0 && (
        <p className="text-muted-foreground text-sm">Nenhum chamado encontrado para o período.</p>
      )}
    </div>
  )
}
