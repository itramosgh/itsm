import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { offsetIso, offsetDateOnly } from '@/lib/date-math'

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Ag. aprovação',
  aprovada: 'Aprovada',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  revertida: 'Revertida',
  reprovada: 'Reprovada',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  concluida: 'default',
  revertida: 'destructive',
  reprovada: 'destructive',
  em_execucao: 'default',
  aprovada: 'secondary',
  aguardando_aprovacao: 'outline',
  rascunho: 'outline',
}

export default async function DashboardMudancasPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from, to } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const fromDate = from ?? offsetDateOnly(-30 * 86_400_000)
  const toDate = to ?? new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()
  const in60Days = offsetIso(60 * 86_400_000)

  const [{ data: gmudsRaw }, { data: upcomingRaw }] = await Promise.all([
    supabase
      .from('change_requests')
      .select('id, title, status, risk_level, created_at, execution_completed_at, reversal_reason, profiles!responsible_id(full_name)')
      .gte('created_at', `${fromDate}T00:00:00Z`)
      .lte('created_at', `${toDate}T23:59:59Z`)
      .order('created_at', { ascending: false })
      .limit(2000) as any,
    supabase
      .from('change_requests')
      .select('id, title, status, risk_level, maintenance_start, maintenance_end, profiles!responsible_id(full_name)')
      .in('status', ['aprovada', 'em_execucao'])
      .gte('maintenance_start', now)
      .lte('maintenance_start', in60Days)
      .order('maintenance_start')
      .limit(10),
  ]) as [{ data: any[] | null }, { data: any[] | null }]

  const gmuds = gmudsRaw ?? []
  const upcoming = upcomingRaw ?? []

  const statusMap: Record<string, number> = {}
  gmuds.forEach((g: any) => {
    statusMap[g.status] = (statusMap[g.status] ?? 0) + 1
  })

  const revertidas = gmuds.filter((g: any) => g.status === 'revertida')

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Dashboard de Mudanças</h1>
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

      {/* Cards por status */}
      <section>
        <h2 className="text-base font-medium mb-3">GMUDs por status no período</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1">{statusMap[key] ?? 0}</p>
            </div>
          ))}
        </div>
      </section>

      {/* GMUDs revertidas */}
      {revertidas.length > 0 && (
        <section>
          <h2 className="text-base font-medium mb-3">
            GMUDs revertidas ({revertidas.length})
          </h2>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Título</th>
                  <th className="text-left px-4 py-3 font-medium">Responsável</th>
                  <th className="text-left px-4 py-3 font-medium">Motivo da reversão</th>
                </tr>
              </thead>
              <tbody>
                {(revertidas as any[]).map((g: any) => (
                  <tr key={g.id} className="border-t hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link href={`/mudancas/${g.id}`} className="hover:underline">{g.title}</Link>
                    </td>
                    <td className="px-4 py-3">{(g.profiles as any)?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.reversal_reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Próximas janelas */}
      <section>
        <h2 className="text-base font-medium mb-3">Próximas janelas de manutenção (60 dias)</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma GMUD agendada nos próximos 60 dias.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {(upcoming as any[]).map((g: any) => (
              <Link
                key={g.id}
                href={`/mudancas/${g.id}`}
                className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{g.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {(g.profiles as any)?.full_name ?? '—'} · Risco: {g.risk_level}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[g.status] ?? 'secondary'}>
                    {STATUS_LABELS[g.status] ?? g.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(g.maintenance_start).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
