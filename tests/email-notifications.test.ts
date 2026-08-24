import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { resolveContactEmails } from '@/lib/email-notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

let companyId: string
let mainContactId: string
let responsibleContactId: string

beforeAll(async () => {
  const { data: company } = await supabase
    .from('companies')
    .insert({ name: 'Empresa Teste Notif' })
    .select('id')
    .single()
  companyId = company!.id

  const { data: contacts } = await supabase
    .from('contacts')
    .insert([
      { company_id: companyId, full_name: 'Contato Principal', email: 'principal@notif.test', is_contract_responsible: false, receives_ticket_cc: false },
      { company_id: companyId, full_name: 'Responsável', email: 'responsavel@notif.test', is_contract_responsible: true, receives_ticket_cc: false },
      { company_id: companyId, full_name: 'CC', email: 'cc@notif.test', is_contract_responsible: false, receives_ticket_cc: true },
      { company_id: companyId, full_name: 'Outro', email: 'outro@notif.test', is_contract_responsible: false, receives_ticket_cc: false },
    ])
    .select('id, email')

  mainContactId = contacts!.find(c => c.email === 'principal@notif.test')!.id
  responsibleContactId = contacts!.find(c => c.email === 'responsavel@notif.test')!.id
})

afterAll(async () => {
  await supabase.from('contacts').delete().eq('company_id', companyId)
  await supabase.from('companies').delete().eq('id', companyId)
})

describe('resolveContactEmails', () => {
  it('inclui contato principal + CC, exclui responsável sem CC e outros', async () => {
    const emails = await resolveContactEmails(supabase as any, mainContactId, companyId)
    expect(emails).toContain('principal@notif.test')
    expect(emails).toContain('cc@notif.test')
    expect(emails).not.toContain('responsavel@notif.test')
    expect(emails).not.toContain('outro@notif.test')
  })

  it('não duplica quando o contato principal também é responsável', async () => {
    const emails = await resolveContactEmails(supabase as any, responsibleContactId, companyId)
    const count = emails.filter(e => e === 'responsavel@notif.test').length
    expect(count).toBe(1)
  })
})
