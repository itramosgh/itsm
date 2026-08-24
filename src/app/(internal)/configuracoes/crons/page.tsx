import { createClient } from '@/lib/supabase/server'
import { CheckCircle2, XCircle, Minus } from 'lucide-react'
import { nowMs, offsetIso } from '@/lib/date-math'

interface CronDef {
  key: string
  name: string
  about: string
  route: string
  schedule: string
  matchCategory: 'cron_job' | 'url_monitoring'
  matchKeyword: string
}

// Schedules reflect what's configured in cron-job.org — update here if changed
const CRON_REGISTRY: CronDef[] = [
  { key: 'sla-alerts',           name: 'Alertas de SLA',              about: 'Envia alertas quando SLA está próximo de vencer ou violado',               route: '/api/cron/sla-alerts',            schedule: 'A cada hora',   matchCategory: 'cron_job',      matchKeyword: 'sla-alerts' },
  { key: 'ticket-automations',   name: 'Automações de Chamados',       about: 'Fechamento automático por ausência de retorno e expiração de aprovações',   route: '/api/cron/ticket-automations',    schedule: 'A cada hora',   matchCategory: 'cron_job',      matchKeyword: 'retorno do cliente' },
  { key: 'agendamento',          name: 'Agendamento',                  about: 'Lembrete 15 min antes e auto-start de chamados agendados',                  route: '/api/cron/agendamento',           schedule: 'A cada 15 min', matchCategory: 'cron_job',      matchKeyword: 'horário agendado' },
  { key: 'announcement-dispatch',name: 'Comunicados Agendados',        about: 'Despacha comunicados programados no horário configurado',                    route: '/api/cron/announcement-dispatch', schedule: 'A cada hora',   matchCategory: 'cron_job',      matchKeyword: 'announcement-dispatch' },
  { key: 'process-pending',      name: 'Alertas de Monitoramento',     about: 'Processa alertas pendentes de integrações e abre chamados automaticamente', route: '/api/cron/process-pending-alerts',schedule: 'A cada 5 min',  matchCategory: 'cron_job',      matchKeyword: 'Alerta pendente' },
  { key: 'url-check',            name: 'Monitoramento de URLs',        about: 'Verifica disponibilidade de URLs e abre/fecha chamados automaticamente',     route: '/api/cron/url-check',             schedule: 'A cada 5 min',  matchCategory: 'url_monitoring', matchKeyword: 'URL' },
  { key: 'meeting-reminders',    name: 'Lembretes de Reunião',         about: 'Envia lembretes de reuniões próximas para os participantes',                 route: '/api/cron/meeting-reminders',     schedule: 'A cada hora',   matchCategory: 'cron_job',      matchKeyword: 'Lembretes de reunião' },
  { key: 'task-reminders',       name: 'Lembretes de Tarefas',         about: 'Envia lembretes de tarefas em atraso ou próximas do vencimento',            route: '/api/cron/task-reminders',        schedule: 'Diário',        matchCategory: 'cron_job',      matchKeyword: 'Lembretes de tarefas' },
  { key: 'billing-alerts',       name: 'Alertas de Faturamento',       about: 'Notifica gestores sobre chamados pendentes de aprovação de faturamento',    route: '/api/cron/billing-alerts',        schedule: 'Diário',        matchCategory: 'cron_job',      matchKeyword: 'billing-alerts' },
  { key: 'recurring-tickets',    name: 'Chamados Recorrentes',         about: 'Cria chamados automaticamente a partir de templates recorrentes',            route: '/api/cron/recurring-tickets',     schedule: 'Diário',        matchCategory: 'cron_job',      matchKeyword: 'recorrente' },
  { key: 'cleanup-logs',         name: 'Limpeza de Logs',              about: 'Remove logs e histórico antigos do banco (retenção 7 dias)',                 route: '/api/cron/cleanup-logs',          schedule: 'Diário',        matchCategory: 'cron_job',      matchKeyword: 'cleanup-logs' },
  { key: 'holiday-import',       name: 'Importação de Feriados',       about: 'Importa feriados nacionais da BrasilAPI para o ano vigente',                route: '/api/cron/holiday-import',        schedule: 'Anual',         matchCategory: 'cron_job',      matchKeyword: 'BrasilAPI' },
  { key: 'holiday-notice',       name: 'Avisos de Feriado',            about: 'Envia avisos de feriados próximos para os clientes',                        route: '/api/cron/holiday-notice',        schedule: 'Diário',        matchCategory: 'cron_job',      matchKeyword: 'feriado' },
  { key: 'monthly-report',       name: 'Relatório Mensal',             about: 'Gera e envia relatório mensal em PDF para os clientes',                     route: '/api/cron/monthly-report',        schedule: 'Mensal',        matchCategory: 'cron_job',      matchKeyword: 'mensal automático' },
]

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'há 1 dia'
  return `há ${days} dias`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default async function CronsPage() {
  const supabase = await createClient()

  const cutoff = offsetIso(-7 * 24 * 60 * 60 * 1000)
  const { data: logs } = await supabase
    .from('system_logs')
    .select('id, category, status, description, details, created_at')
    .in('category', ['cron_job', 'url_monitoring'])
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(500)

  const allLogs = (logs ?? []) as any[]
  const todayStr = new Date().toDateString()
  const yesterday = nowMs() - 24 * 60 * 60 * 1000

  const cronStatus = CRON_REGISTRY.map(cron => {
    const matching = allLogs.filter(
      l => l.category === cron.matchCategory &&
        (l.description as string).toLowerCase().includes(cron.matchKeyword.toLowerCase())
    )
    const latest = matching[0] ?? null
    const ranToday = matching.some(l => new Date(l.created_at).toDateString() === todayStr)
    const hasFailure24h = matching.some(l => l.status === 'failure' && new Date(l.created_at).getTime() > yesterday)
    return { ...cron, latest, ranToday, hasFailure24h, total7d: matching.length }
  })

  const totalRanToday = cronStatus.filter(c => c.ranToday).length
  const totalFailures24h = allLogs.filter(l => l.status === 'failure' && new Date(l.created_at).getTime() > yesterday).length

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Monitoramento de Crons</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Status baseado nos logs do sistema dos últimos 7 dias. Schedules configurados no cron-job.org.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <p className="text-2xl font-semibold">{CRON_REGISTRY.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Jobs registrados</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-2xl font-semibold text-green-600">{totalRanToday}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Com execução hoje</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className={`text-2xl font-semibold ${totalFailures24h > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {totalFailures24h}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Falhas nas últimas 24h</p>
        </div>
      </div>

      {/* Cron list */}
      <div className="border rounded-lg divide-y">
        {cronStatus.map(cron => (
          <div key={cron.key} className="flex items-start gap-3 p-4">
            {/* Status icon */}
            <div className="mt-0.5 shrink-0">
              {!cron.latest ? (
                <Minus className="w-4 h-4 text-muted-foreground" />
              ) : cron.hasFailure24h ? (
                <XCircle className="w-4 h-4 text-red-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{cron.name}</span>
                <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{cron.route}</code>
                <span className="text-xs border rounded-full px-2 py-0.5 text-muted-foreground">{cron.schedule}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{cron.about}</p>
              {cron.latest && (
                <p className="text-xs text-foreground/70 mt-1 truncate" title={cron.latest.description}>
                  {cron.latest.description}
                </p>
              )}
            </div>

            {/* Time + count */}
            <div className="shrink-0 text-right min-w-[90px]">
              {cron.latest ? (
                <>
                  <p className="text-xs font-medium" title={formatDate(cron.latest.created_at)}>
                    {relativeTime(cron.latest.created_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">{cron.total7d} exec. em 7d</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">sem dados (7d)</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
