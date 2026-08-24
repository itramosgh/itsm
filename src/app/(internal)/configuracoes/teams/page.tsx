import { createClient } from '@/lib/supabase/server'
import { TeamsWebhookList } from '@/components/settings/TeamsWebhookList'

export default async function TeamsConfigPage() {
  const supabase = await createClient()
  const { data: webhooks } = await supabase
    .from('teams_webhook_configs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Webhooks Microsoft Teams</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure webhooks para receber notificações em canais do Microsoft Teams.
          Para criar: no canal desejado, clique em <strong className="text-foreground">•••</strong> → <strong className="text-foreground">Workflows</strong> → pesquise e ative o template <strong className="text-foreground">&quot;Send webhook alerts&quot;</strong>. Copie a URL gerada e cole abaixo.
        </p>
      </div>
      <TeamsWebhookList webhooks={(webhooks ?? []) as any[]} />
    </div>
  )
}
