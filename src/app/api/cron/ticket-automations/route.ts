import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, awaitingClientReminderHtml, buildFromAddress } from '@/lib/email'
import { resolveContactEmails } from '@/lib/email-notifications'
import { insertLog } from '@/lib/log'
import { addBusinessDays } from '@/lib/sla'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('email_from_address, email_from_name, company_whatsapp, business_hours_days')
    .single()
  const from = buildFromAddress((settings as any)?.email_from_name ?? null, (settings as any)?.email_from_address ?? null)
  const businessDays: number[] = (settings as any)?.business_hours_days ?? [1, 2, 3, 4, 5]

  // Tabela de feriados é pequena (importação anual) — buscar tudo é mais simples
  // e mais seguro do que estimar uma janela de datas que cubra qualquer chamado parado.
  const { data: holidayRows } = await supabase.from('holidays').select('date')
  const holidays = (holidayRows ?? []).map((h: any) => h.date)

  // Prazo de espera para lembrete (24h) e fechamento (48h). Contratos 24x7 contam
  // horas corridas; os demais pulam fim de semana e feriado (addBusinessDays).
  function waitingDeadline(lastUpdate: Date, hours: number, is24x7: boolean): Date {
    if (is24x7) return new Date(lastUpdate.getTime() + hours * 3_600_000)
    return addBusinessDays(lastUpdate, hours, businessDays, holidays)
  }

  let actions = 0

  // ── AGUARDANDO CLIENTE ──────────────────────────────────────────────
  const { data: awaitingClientTickets } = await supabase
    .from('tickets')
    .select('id, number, title, updated_at, contact_id, company_id, contacts(email, full_name), assigned_to, contracts(is_24x7)')
    .eq('status', 'aguardando_cliente')

  for (const ticket of (awaitingClientTickets ?? []) as any[]) {
    const lastUpdate = new Date(ticket.updated_at)
    const is24x7 = ticket.contracts?.is_24x7 === true
    const closeDeadline = waitingDeadline(lastUpdate, 48, is24x7)
    const reminderDeadline = waitingDeadline(lastUpdate, 24, is24x7)

    if (now >= closeDeadline) {
      // Auto-fechar após 2 dias sem resposta
      await supabase.from('tickets').update({
        status: 'fechado',
        closed_at: now.toISOString(),
      } as never).eq('id', ticket.id)

      await supabase.from('ticket_interactions').insert({
        ticket_id: ticket.id,
        type: 'system',
        content: 'Chamado encerrado por falta de retorno do cliente após 2 dias de espera.',
        is_system: true,
      } as never)

      await insertLog(supabase, 'cron_job', 'success', `Chamado #${ticket.number} encerrado automaticamente por ausência de retorno do cliente`, {
        ticket_id: ticket.id,
        ticket_number: ticket.number,
        trigger: 'auto_close_48h',
      })

      if (ticket.assigned_to) {
        const { data: authUser } = await supabase.auth.admin.getUserById(ticket.assigned_to)
        if (authUser.user?.email) {
          await sendEmail({
            to: authUser.user.email,
            subject: `Chamado #${ticket.number} encerrado automaticamente`,
            from,
            html: `<p>O chamado <strong>#${ticket.number} — ${ticket.title}</strong> foi encerrado por ausência de retorno do cliente após 2 dias.</p>`,
          })
        }
      }
      actions++
      continue
    }

    if (now >= reminderDeadline) {
      // Verificar se já foi enviado lembrete nas últimas 24h para não repetir por execução do cron
      const since24h = new Date(now.getTime() - 24 * 3_600_000).toISOString()
      const { data: recentReminder } = await supabase
        .from('ticket_interactions')
        .select('id')
        .eq('ticket_id', ticket.id)
        .eq('is_system', true)
        .eq('content', 'Lembrete automático de retorno enviado ao solicitante.')
        .gte('created_at', since24h)
        .limit(1)

      if (recentReminder && recentReminder.length > 0) continue

      const contactEmails = await resolveContactEmails(supabase, ticket.contact_id, ticket.company_id)
      if (contactEmails.length > 0) {
        await sendEmail({
          to: contactEmails,
          subject: `Aguardamos seu retorno — Chamado #${ticket.number}`,
          from,
          html: awaitingClientReminderHtml({
            ticketNumber: ticket.number,
            ticketTitle: ticket.title,
            portalUrl: appUrl,
          }),
        })

        await supabase.from('ticket_interactions').insert({
          ticket_id: ticket.id,
          type: 'system',
          content: 'Lembrete automático de retorno enviado ao solicitante.',
          is_system: true,
        } as never)

        await insertLog(supabase, 'email_sent', 'success', `Lembrete de retorno enviado ao cliente — Chamado #${ticket.number}`, {
          ticket_id: ticket.id,
          ticket_number: ticket.number,
          recipients: contactEmails,
          trigger: 'awaiting_client_reminder_24h',
        })
      }
      actions++
    }
  }

  // ── AGUARDANDO APROVAÇÃO ────────────────────────────────────────────
  // Deadline varia por contrato/feriado, não dá pra filtrar por data direto no SQL —
  // volume de aprovações pendentes é baixo, filtra em JS após buscar todas.
  const { data: pendingApprovals } = await supabase
    .from('ticket_approvals')
    .select('id, ticket_id, created_at, tickets(number, title, assigned_to, contact_id, contacts(email), contracts(is_24x7))')
    .eq('status', 'pendente')

  for (const approval of (pendingApprovals ?? []) as any[]) {
    const ticket = approval.tickets as any
    const is24x7 = ticket?.contracts?.is_24x7 === true
    const closeDeadline = waitingDeadline(new Date(approval.created_at), 48, is24x7)
    if (now < closeDeadline) continue

    await supabase.from('ticket_approvals').update({ status: 'expirado' } as never).eq('id', approval.id)
    await supabase.from('tickets').update({
      status: 'fechado',
      closed_at: now.toISOString(),
    } as never).eq('id', approval.ticket_id)

    await supabase.from('ticket_interactions').insert({
      ticket_id: approval.ticket_id,
      type: 'system',
      content: 'Chamado encerrado por ausência de aprovação após 2 dias.',
      is_system: true,
    } as never)

    const recipients: string[] = []
    if (ticket.contacts?.email) recipients.push(ticket.contacts.email)
    if (ticket.assigned_to) {
      const { data: authUser } = await supabase.auth.admin.getUserById(ticket.assigned_to)
      if (authUser.user?.email) recipients.push(authUser.user.email)
    }
    const { data: gestores } = await supabase.from('profiles').select('id').eq('role', 'gestor').eq('is_active', true)
    for (const g of (gestores ?? []) as any[]) {
      const { data: au } = await supabase.auth.admin.getUserById(g.id)
      if (au.user?.email) recipients.push(au.user.email)
    }

    const uniqueRecipients = [...new Set(recipients)]
    if (uniqueRecipients.length > 0) {
      await sendEmail({
        to: uniqueRecipients,
        subject: `Chamado #${ticket.number} encerrado — ausência de aprovação`,
        from,
        html: `<p>O chamado <strong>#${ticket.number} — ${ticket.title}</strong> foi encerrado automaticamente por ausência de aprovação após 2 dias.</p>`,
      })

      await insertLog(supabase, 'email_sent', 'success', `Notificação de encerramento por falta de aprovação enviada — Chamado #${ticket.number}`, {
        ticket_id: approval.ticket_id,
        ticket_number: ticket.number,
        approval_id: approval.id,
        recipients: uniqueRecipients,
        trigger: 'approval_expired_notification',
      })
    }

    await insertLog(supabase, 'approval', 'success', `Aprovação expirada e chamado #${ticket.number} encerrado automaticamente após 2 dias`, {
      ticket_id: approval.ticket_id,
      ticket_number: ticket.number,
      approval_id: approval.id,
      trigger: 'auto_close_approval_48h',
    })

    actions++
  }

  return NextResponse.json({ ok: true, actions })
}
