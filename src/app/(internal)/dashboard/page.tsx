import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { offsetIso, offsetDateOnly } from '@/lib/date-math'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single() as { data: any }

  const now = new Date().toISOString()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayStartISO = todayStart.toISOString()
  const todayDate = new Date().toISOString().slice(0, 10)
  const next7DaysDate = offsetDateOnly(7 * 24 * 3600 * 1000)
  const next2Hours = offsetIso(2 * 3600 * 1000)
  const nextWeek = offsetIso(7 * 24 * 3600 * 1000)
  const next14Days = offsetIso(14 * 24 * 3600 * 1000)
  const twoWeeksAgo = offsetIso(-14 * 24 * 3600 * 1000)
  const last7Days = offsetIso(-7 * 24 * 3600 * 1000)

  const role = profile?.role
  const isAnalista = role === 'analista'

  // For analista: pre-fetch meeting IDs where they are a participant
  let participantMeetingIds: string[] = []
  if (isAnalista) {
    const { data: participations } = await supabase
      .from('meeting_participants')
      .select('meeting_id')
      .eq('profile_id', user!.id) as { data: any[] | null }
    participantMeetingIds = (participations ?? []).map((p: any) => p.meeting_id)
  }

  const [
    { data: overdueTasks },
    { data: upcomingTasks },
    { data: upcomingMeetings },
    { data: upcomingGmuds },
    { data: pendingBilling },
    { data: scheduledTickets },
    { data: recurrenceAlerts },
    { data: recentFailures },
  ] = await Promise.all([
    isAnalista
      ? supabase.from('tasks').select('id, title, due_date, companies(name)')
          .eq('status', 'vencida').eq('assigned_to', user!.id).order('due_date').limit(5)
      : supabase.from('tasks').select('id, title, due_date, companies(name), profiles!assigned_to(full_name)')
          .eq('status', 'vencida').order('due_date').limit(5),
    // Tarefas pendentes vencendo nos próximos 7 dias
    isAnalista
      ? supabase.from('tasks').select('id, title, due_date, companies(name)')
          .eq('status', 'pendente').eq('assigned_to', user!.id)
          .gte('due_date', todayDate).lte('due_date', next7DaysDate)
          .order('due_date').limit(10)
      : supabase.from('tasks').select('id, title, due_date, companies(name), profiles!assigned_to(full_name)')
          .eq('status', 'pendente')
          .gte('due_date', todayDate).lte('due_date', next7DaysDate)
          .order('due_date').limit(10),
    isAnalista
      ? (participantMeetingIds.length > 0
          ? supabase.from('meetings')
              .select('id, title, scheduled_at, companies(name)')
              .eq('status', 'agendada')
              .gte('scheduled_at', todayStartISO)
              .lte('scheduled_at', nextWeek)
              .in('id', participantMeetingIds)
              .order('scheduled_at')
              .limit(5)
          : Promise.resolve({ data: [] }))
      : supabase.from('meetings')
          .select('id, title, scheduled_at, companies(name)')
          .eq('status', 'agendada')
          .gte('scheduled_at', todayStartISO)
          .lte('scheduled_at', nextWeek)
          .order('scheduled_at')
          .limit(5),
    // GMUDs: apenas aprovada | em_execucao; analistas filtram por responsible_id
    isAnalista
      ? supabase
          .from('change_requests')
          .select('id, title, status, risk_level, maintenance_start, maintenance_end, profiles!responsible_id(full_name)')
          .in('status', ['aprovada', 'em_execucao'])
          .eq('responsible_id', user!.id)
          .gte('maintenance_start', now)
          .lte('maintenance_start', next14Days)
          .order('maintenance_start')
          .limit(5)
      : supabase
          .from('change_requests')
          .select('id, title, status, risk_level, maintenance_start, maintenance_end, profiles!responsible_id(full_name)')
          .in('status', ['aprovada', 'em_execucao'])
          .gte('maintenance_start', now)
          .lte('maintenance_start', next14Days)
          .order('maintenance_start')
          .limit(5),
    (!isAnalista
      ? supabase
          .from('tickets')
          .select('id, number, title, companies(name)')
          .eq('billing_status', 'pendente')
          .eq('status', 'fechado')
          .order('closed_at')
          .limit(10)
      : Promise.resolve({ data: [] })),
    // Chamados agendados
    isAnalista
      ? supabase
          .from('tickets')
          .select('id, number, title, scheduled_at, companies(name), profiles!assigned_to(full_name)')
          .eq('status', 'agendado')
          .eq('assigned_to', user!.id)
          .order('scheduled_at')
          .limit(10)
      : supabase
          .from('tickets')
          .select('id, number, title, scheduled_at, companies(name), profiles!assigned_to(full_name)')
          .eq('status', 'agendado')
          .order('scheduled_at')
          .limit(10),
    // Alertas de recorrência (admin/gestor apenas)
    !isAnalista
      ? supabase
          .from('tickets')
          .select('id, number, title, companies(name)')
          .eq('recurrence_detected', true)
          .gte('created_at', twoWeeksAgo)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    // Falhas de sistema nos últimos 7 dias (admin/gestor apenas)
    !isAnalista
      ? supabase
          .from('system_logs')
          .select('id, category, description, created_at')
          .eq('status', 'failure')
          .gte('created_at', last7Days)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
  ]) as [
    { data: any[] | null },
    { data: any[] | null },
    { data: any[] | null },
    { data: any[] | null },
    { data: any[] | null },
    { data: any[] | null },
    { data: any[] | null },
    { data: any[] | null },
  ]

  const tasks = overdueTasks ?? []
  const upcoming = upcomingTasks ?? []
  const meetings = upcomingMeetings ?? []
  const gmuds = upcomingGmuds ?? []
  const billing = pendingBilling ?? []
  const scheduled = scheduledTickets ?? []
  const recurrence = recurrenceAlerts ?? []
  const failures = recentFailures ?? []
  const isEmpty = tasks.length === 0 && upcoming.length === 0 && meetings.length === 0
    && gmuds.length === 0 && billing.length === 0 && scheduled.length === 0 && recurrence.length === 0

  const categoryLabels: Record<string, string> = {
    email_sent: 'E-mail enviado',
    email_received: 'E-mail recebido',
    webhook_received: 'Webhook',
    url_monitoring: 'Monitoramento',
    cron_job: 'Cron',
    approval: 'Aprovação',
    auth: 'Autenticação',
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Falhas recentes (admin/gestor) */}
      {!isAnalista && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${failures.length > 0 ? 'bg-red-500' : 'bg-green-500'}`} />
              Falhas nos últimos 7 dias
              {failures.length > 0 && (
                <Badge variant="destructive" className="ml-1">{failures.length}</Badge>
              )}
            </h2>
            <Link
              href="/configuracoes/logs?status=failure"
              className="text-xs text-muted-foreground hover:underline"
            >
              Ver todos os logs
            </Link>
          </div>
          {failures.length === 0 ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              Nenhuma falha registrada nos últimos 7 dias.
            </p>
          ) : (
            <div className="divide-y rounded-lg border border-red-200">
              {(failures as any[]).map((log: any) => (
                <div key={log.id} className="flex items-start justify-between px-4 py-3 gap-4 bg-red-50 hover:bg-red-100/60">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{log.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="border-red-300 text-red-700 text-xs whitespace-nowrap">
                      {categoryLabels[log.category] ?? log.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {formatDateTime(log.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isEmpty ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma tarefa vencida ou reunião próxima.
        </p>
      ) : (
        <>
          {/* Chamados agendados */}
          {scheduled.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3">Chamados Agendados</h2>
              <div className="divide-y rounded-lg border">
                {(scheduled as any[]).map((t: any) => {
                  const isUrgent = t.scheduled_at && new Date(t.scheduled_at) <= new Date(next2Hours)
                  return (
                    <a
                      key={t.id}
                      href={`/chamados/${t.id}`}
                      className={`flex items-center justify-between px-4 py-3 gap-4 hover:bg-muted/50 ${isUrgent ? 'bg-orange-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          #{t.number} — {t.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(t.companies as any)?.name ?? '—'}
                          {!isAnalista && (t.profiles as any)?.full_name && (
                            <> · {(t.profiles as any).full_name}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isUrgent && (
                          <Badge variant="destructive" className="whitespace-nowrap">Próximas 2h</Badge>
                        )}
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {t.scheduled_at ? formatDateTime(t.scheduled_at) : '—'}
                        </span>
                      </div>
                    </a>
                  )
                })}
              </div>
            </section>
          )}

          {/* Alertas de recorrência (admin/gestor) */}
          {!isAnalista && recurrence.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                Alertas de recorrência ({recurrence.length})
              </h2>
              <div className="divide-y rounded-lg border border-amber-200 bg-amber-50">
                {(recurrence as any[]).map((t: any) => (
                  <a
                    key={t.id}
                    href={`/chamados/${t.id}`}
                    className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-amber-100"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">#{t.number} — {t.title}</p>
                      <p className="text-xs text-muted-foreground">{(t.companies as any)?.name ?? '—'}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700">
                      Recorrente
                    </Badge>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Tarefas vencidas */}
          {tasks.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                Tarefas vencidas
              </h2>
              <div className="divide-y rounded-lg border">
                {tasks.map((task: any) => (
                  <div key={task.id} className="flex items-center justify-between px-4 py-3 gap-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        href="/tarefas"
                        className="font-medium text-sm hover:underline truncate block"
                      >
                        {task.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {(task.companies as any)?.name ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {!isAnalista && (task.profiles as any)?.full_name && (
                        <span className="text-xs text-muted-foreground">
                          {(task.profiles as any).full_name}
                        </span>
                      )}
                      <Badge variant="destructive" className="whitespace-nowrap">
                        Vencida em {formatDate(task.due_date)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tarefas próximas (pendentes nos próximos 7 dias) */}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500" />
                Tarefas próximas (7 dias)
              </h2>
              <div className="divide-y rounded-lg border border-yellow-200 bg-yellow-50">
                {upcoming.map((task: any) => {
                  const isToday = task.due_date === todayDate
                  return (
                    <div key={task.id} className="flex items-center justify-between px-4 py-3 gap-4">
                      <div className="min-w-0 flex-1">
                        <Link
                          href="/tarefas"
                          className="font-medium text-sm hover:underline truncate block"
                        >
                          {task.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {(task.companies as any)?.name ?? '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {!isAnalista && (task.profiles as any)?.full_name && (
                          <span className="text-xs text-muted-foreground">
                            {(task.profiles as any).full_name}
                          </span>
                        )}
                        <Badge
                          variant={isToday ? 'destructive' : 'outline'}
                          className={`whitespace-nowrap ${!isToday ? 'border-yellow-400 text-yellow-700 bg-yellow-50' : ''}`}
                        >
                          {isToday ? 'Vence hoje' : `Vence em ${formatDate(task.due_date)}`}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Próximas reuniões */}
          {meetings.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3">
                Próximas reuniões (7 dias)
              </h2>
              <div className="divide-y rounded-lg border">
                {meetings.map((meeting: any) => (
                  <div key={meeting.id} className="flex items-center justify-between px-4 py-3 gap-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/reunioes/${meeting.id}`}
                        className="font-medium text-sm hover:underline truncate block"
                      >
                        {meeting.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {(meeting.companies as any)?.name ?? '—'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                      {formatDateTime(meeting.scheduled_at)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* GMUDs próximas */}
          {gmuds.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3">Mudanças Programadas (próximos 14 dias)</h2>
              <div className="divide-y rounded-lg border">
                {(gmuds as any[]).map((gmud: any) => (
                  <a
                    key={gmud.id}
                    href={`/mudancas/${gmud.id}`}
                    className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{gmud.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(gmud.maintenance_start).toLocaleString('pt-BR')} →{' '}
                        {new Date(gmud.maintenance_end).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <Badge variant={gmud.status === 'em_execucao' ? 'default' : 'secondary'} className="shrink-0">
                      {gmud.status === 'em_execucao' ? 'Em Execução' : 'Aprovada'}
                    </Badge>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Cobrança pendente (admin/gestor) */}
          {!isAnalista && billing.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500 mr-2" />
                Cobrança Pendente ({billing.length})
              </h2>
              <div className="divide-y rounded-lg border border-yellow-200 bg-yellow-50">
                {(billing as any[]).map((t: any) => (
                  <a
                    key={t.id}
                    href={`/chamados/${t.id}`}
                    className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-yellow-100"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">#{t.number} — {t.title}</p>
                      <p className="text-xs text-muted-foreground">{(t.companies as any)?.name ?? '—'}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">Pendente</Badge>
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
