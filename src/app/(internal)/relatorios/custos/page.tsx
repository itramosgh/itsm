import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { offsetDateOnly } from '@/lib/date-math'

function fmtBrl(value: number | null): string {
  if (value === null || value === 0) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function CostReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string; to?: string; analyst_id?: string
    company_id?: string; type?: string
  }>
}) {
  const { from, to, analyst_id, company_id, type } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }

  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const fromDate = from ?? offsetDateOnly(-30 * 24 * 3600 * 1000)
  const toDate = to ?? new Date().toISOString().slice(0, 10)

  let query = supabase
    .from('tickets')
    .select(`
      id, number, title, billing_status, closed_at,
      companies!inner(id, name, company_type),
      profiles!assigned_to(id, full_name),
      ticket_costs(service_time_minutes, travel_discount_minutes, km_traveled,
                   toll_amount, parking_amount, total_amount, hourly_rate_applied, km_rate_applied)
    `)
    .eq('status', 'fechado')
    .not('ticket_costs', 'is', null)
    .gte('closed_at', `${fromDate}T00:00:00Z`)
    .lte('closed_at', `${toDate}T23:59:59Z`)
    .order('closed_at', { ascending: false })
    .limit(2000) as any

  if (analyst_id) query = query.eq('assigned_to', analyst_id)
  if (company_id) query = query.eq('company_id', company_id)
  if (type) query = (query as any).eq('companies.company_type', type)

  const { data: ticketsRaw } = await query
  const tickets = (ticketsRaw as any[]) ?? []

  const [{ data: analysts }, { data: companies }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
  ])

  const totals = tickets.reduce(
    (acc: any, t: any) => {
      const c = Array.isArray(t.ticket_costs) ? t.ticket_costs[0] : t.ticket_costs
      if (!c) return acc
      return {
        total: acc.total + (c.total_amount ?? 0),
        km: acc.km + (c.km_traveled ?? 0),
        toll: acc.toll + (c.toll_amount ?? 0),
        parking: acc.parking + (c.parking_amount ?? 0),
      }
    },
    { total: 0, km: 0, toll: 0, parking: 0 }
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Relatório de Custos</h1>

      <form className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium">De</label>
          <input type="date" name="from" defaultValue={fromDate}
            className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Até</label>
          <input type="date" name="to" defaultValue={toDate}
            className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Analista</label>
          <select name="analyst_id" defaultValue={analyst_id ?? ''}
            className="border rounded-md px-3 py-2 text-sm">
            <option value="">Todos</option>
            {(analysts as any[] ?? []).map((a: any) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Empresa</label>
          <select name="company_id" defaultValue={company_id ?? ''}
            className="border rounded-md px-3 py-2 text-sm">
            <option value="">Todas</option>
            {(companies as any[] ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Tipo</label>
          <select name="type" defaultValue={type ?? ''}
            className="border rounded-md px-3 py-2 text-sm">
            <option value="">Todos</option>
            <option value="avulso">Avulso</option>
            <option value="padrao">Contrato</option>
          </select>
        </div>
        <button type="submit"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm">
          Filtrar
        </button>
      </form>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total geral', value: fmtBrl(totals.total) },
          { label: 'Quilômetros', value: `${totals.km.toFixed(1)} km` },
          { label: 'Pedágios', value: fmtBrl(totals.toll) },
          { label: 'Estacionamentos', value: fmtBrl(totals.parking) },
        ].map((item) => (
          <div key={item.label} className="border rounded-md p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-lg font-semibold mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Chamado</th>
              <th className="text-left px-4 py-3 font-medium">Empresa</th>
              <th className="text-left px-4 py-3 font-medium">Analista</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum chamado com custos no período.</td></tr>
            )}
            {tickets.map((t: any) => {
              const c = Array.isArray(t.ticket_costs) ? t.ticket_costs[0] : t.ticket_costs
              return (
                <tr key={t.id} className="border-t hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <a href={`/chamados/${t.id}`} className="hover:underline">
                      #{t.number} — {t.title}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {(t.companies as any)?.name}
                    {(t.companies as any)?.company_type === 'avulso' && (
                      <span className="ml-1 text-xs text-muted-foreground">(avulso)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{(t.profiles as any)?.full_name ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{fmtBrl(c?.total_amount)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={t.billing_status === 'cobrado' ? 'default' : 'secondary'}>
                      {t.billing_status === 'cobrado' ? 'Cobrado' : 'Pendente'}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
