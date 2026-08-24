import { describe, it, expect, vi, afterEach } from 'vitest'
import { calculateDeadline, addBusinessHours, addBusinessDays, isBusinessDay, getEffectiveSLAStart, getSLAPercentUsed } from '@/lib/sla'

// Todos os timestamps usam offset -03:00 (São Paulo) ou Z (UTC explícito) para serem
// timezone-agnostic. Timestamps sem sufixo seriam "local time" e quebrariam em UTC.

const defaultSettings = {
  start: '09:00',
  end: '18:00',
  days: [1, 2, 3, 4, 5], // Seg-Sex
}

describe('isBusinessDay', () => {
  it('segunda-feira sem feriado é dia útil', () => {
    const monday = new Date('2026-06-01T10:00:00-03:00') // seg 10h SP
    expect(isBusinessDay(monday, defaultSettings, [])).toBe(true)
  })

  it('sábado não é dia útil', () => {
    const saturday = new Date('2026-06-06T10:00:00-03:00') // sáb 10h SP
    expect(isBusinessDay(saturday, defaultSettings, [])).toBe(false)
  })

  it('feriado não é dia útil', () => {
    const holiday = new Date('2026-06-01T10:00:00-03:00') // seg 10h SP
    expect(isBusinessDay(holiday, defaultSettings, ['2026-06-01'])).toBe(false)
  })
})

describe('calculateDeadline — 24x7', () => {
  it('prazo 24x7 ignora horário comercial', () => {
    const created = new Date('2026-06-06T22:00:00Z')
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 2,
      is24x7: true,
      settings: defaultSettings,
      holidays: [],
    })
    expect(deadline.getTime()).toBe(new Date('2026-06-07T00:00:00Z').getTime())
  })
})

describe('calculateDeadline — horário comercial', () => {
  it('prazo dentro do mesmo dia', () => {
    const created = new Date('2026-06-01T10:00:00-03:00') // seg 10h SP
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T14:00:00-03:00') // seg 14h SP
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('prazo que vira dia — segunda 16h + 4h → terça 11h', () => {
    const created = new Date('2026-06-01T16:00:00-03:00') // seg 16h SP
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-02T11:00:00-03:00') // ter 11h SP
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('prazo que pula fim de semana — sexta 16h + 4h → segunda 11h', () => {
    const created = new Date('2026-05-29T16:00:00-03:00') // sex 16h SP
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T11:00:00-03:00') // seg 11h SP
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('prazo que pula feriado na segunda — sexta 16h + 4h + feriado segunda → terça 11h', () => {
    const created = new Date('2026-05-29T16:00:00-03:00') // sex 16h SP
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: ['2026-06-01'],
    })
    const expected = new Date('2026-06-02T11:00:00-03:00') // ter 11h SP
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('abertura fora do horário comercial conta a partir do início do próximo dia útil', () => {
    const created = new Date('2026-05-30T10:00:00-03:00') // sáb 10h SP
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T13:00:00-03:00') // seg 13h SP
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('abertura antes do horário comercial conta a partir do início do dia', () => {
    const created = new Date('2026-06-01T07:00:00-03:00') // seg 07h SP
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T13:00:00-03:00') // seg 13h SP
    expect(deadline.getTime()).toBe(expected.getTime())
  })
})

describe('addBusinessDays', () => {
  const businessDays = [1, 2, 3, 4, 5] // Seg-Sex

  it('dia útil no meio da semana não é afetado — terça 10h + 24h → quarta 10h', () => {
    const start = new Date('2026-06-02T10:00:00-03:00') // ter 10h SP
    const result = addBusinessDays(start, 24, businessDays, [])
    const expected = new Date('2026-06-03T10:00:00-03:00') // qua 10h SP
    expect(result.getTime()).toBe(expected.getTime())
  })

  it('sexta 17h + 24h pula fim de semana → segunda 17h', () => {
    const start = new Date('2026-05-29T17:00:00-03:00') // sex 17h SP
    const result = addBusinessDays(start, 24, businessDays, [])
    const expected = new Date('2026-06-01T17:00:00-03:00') // seg 17h SP
    expect(result.getTime()).toBe(expected.getTime())
  })

  it('sexta 17h + 48h pula fim de semana → terça 17h', () => {
    const start = new Date('2026-05-29T17:00:00-03:00') // sex 17h SP
    const result = addBusinessDays(start, 48, businessDays, [])
    const expected = new Date('2026-06-02T17:00:00-03:00') // ter 17h SP
    expect(result.getTime()).toBe(expected.getTime())
  })

  it('feriado emendado com fim de semana também é descontado', () => {
    // sexta 29/05 17h + 48h; segunda 01/06 é feriado → soma sexta(parcial) + terça + quarta
    const start = new Date('2026-05-29T17:00:00-03:00') // sex 17h SP
    const result = addBusinessDays(start, 48, businessDays, ['2026-06-01'])
    const expected = new Date('2026-06-03T17:00:00-03:00') // qua 17h SP
    expect(result.getTime()).toBe(expected.getTime())
  })

  it('início em dia não-útil (sábado) — tempo de espera não contado no fim de semana conta a partir da meia-noite do próximo dia útil', () => {
    const start = new Date('2026-05-30T10:00:00-03:00') // sáb 10h SP
    const result = addBusinessDays(start, 24, businessDays, [])
    const expected = new Date('2026-06-02T00:00:00-03:00') // ter 00h SP (24h corridas a partir de segunda 00h)
    expect(result.getTime()).toBe(expected.getTime())
  })
})

describe('getEffectiveSLAStart', () => {
  const settings = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }

  it('dentro do expediente → retorna createdAt inalterado', () => {
    const dt = new Date('2026-06-01T10:00:00-03:00') // seg 10h SP
    expect(getEffectiveSLAStart(dt, false, settings, []).getTime()).toBe(dt.getTime())
  })

  it('antes do expediente → snapa para 09h do mesmo dia', () => {
    const dt = new Date('2026-06-01T07:00:00-03:00') // seg 07h SP
    const expected = new Date('2026-06-01T09:00:00-03:00')
    expect(getEffectiveSLAStart(dt, false, settings, []).getTime()).toBe(expected.getTime())
  })

  it('após o expediente → próximo dia útil às 09h', () => {
    const dt = new Date('2026-06-01T20:00:00-03:00') // seg 20h SP
    const expected = new Date('2026-06-02T09:00:00-03:00') // ter 09h SP
    expect(getEffectiveSLAStart(dt, false, settings, []).getTime()).toBe(expected.getTime())
  })

  it('sábado → segunda-feira às 09h', () => {
    const dt = new Date('2026-06-06T10:00:00-03:00') // sáb SP
    const expected = new Date('2026-06-08T09:00:00-03:00') // seg SP
    expect(getEffectiveSLAStart(dt, false, settings, []).getTime()).toBe(expected.getTime())
  })

  it('feriado → próximo dia útil às 09h', () => {
    const dt = new Date('2026-06-01T10:00:00-03:00') // seg, mas é feriado
    const expected = new Date('2026-06-02T09:00:00-03:00') // ter
    expect(getEffectiveSLAStart(dt, false, settings, ['2026-06-01']).getTime()).toBe(expected.getTime())
  })

  it('is24x7 → sempre retorna createdAt', () => {
    const dt = new Date('2026-06-06T23:00:00-03:00') // sáb 23h SP
    expect(getEffectiveSLAStart(dt, true, settings, []).getTime()).toBe(dt.getTime())
  })
})

describe('getSLAPercentUsed — com slaStartsAt', () => {
  afterEach(() => { vi.useRealTimers() })

  it('antes do início do SLA → 0%', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T08:00:00-03:00'))
    const slaStartsAt = new Date('2026-06-01T09:00:00-03:00')
    const deadline = new Date('2026-06-01T17:00:00-03:00')
    expect(getSLAPercentUsed(slaStartsAt, deadline, null)).toBe(0)
  })

  it('exatamente no início → 0%', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T09:00:00-03:00'))
    const slaStartsAt = new Date('2026-06-01T09:00:00-03:00')
    const deadline = new Date('2026-06-01T17:00:00-03:00')
    expect(getSLAPercentUsed(slaStartsAt, deadline, null)).toBe(0)
  })

  it('na metade → 50%', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T13:00:00-03:00'))
    const slaStartsAt = new Date('2026-06-01T09:00:00-03:00')
    const deadline = new Date('2026-06-01T17:00:00-03:00')
    expect(getSLAPercentUsed(slaStartsAt, deadline, null)).toBe(50)
  })

  it('após o deadline → 100%', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T18:00:00-03:00'))
    const slaStartsAt = new Date('2026-06-01T09:00:00-03:00')
    const deadline = new Date('2026-06-01T17:00:00-03:00')
    expect(getSLAPercentUsed(slaStartsAt, deadline, null)).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Regressão: servidor Vercel roda em UTC, horário comercial configurado em SP
// Estes testes usam timestamps UTC explícitos para expor o bug de fuso horário
// ---------------------------------------------------------------------------
describe('getEffectiveSLAStart — regressão UTC (fuso horário São Paulo)', () => {
  const settings = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }

  it('07:00 SP (10:00Z) → deve snapar para 09:00 SP = 12:00Z', () => {
    // Chamado recebido às 07:00 SP; em servidor UTC getHours()=10 → código antigo não snapava
    const dt = new Date('2026-06-01T10:00:00Z') // = 07:00 São Paulo
    const result = getEffectiveSLAStart(dt, false, settings, [])
    expect(result.toISOString()).toBe('2026-06-01T12:00:00.000Z') // 09:00 SP
  })

  it('18:37 SP (21:37Z) segunda → snapa para terça 09:00 SP = 12:00Z', () => {
    // nextBusinessDayStart antigo fazia setHours(9,0,0,0) = 09:00 UTC = 06:00 SP
    const dt = new Date('2026-06-01T21:37:00Z') // = 18:37 SP segunda
    const result = getEffectiveSLAStart(dt, false, settings, [])
    expect(result.toISOString()).toBe('2026-06-02T12:00:00.000Z') // terça 09:00 SP
  })

  it('domingo 23:00 SP (= segunda 02:00Z) → não é dia útil, snapa para segunda 09:00 SP = 12:00Z', () => {
    // date.getDay() em UTC retorna 1 (seg), mas em SP ainda é domingo → isBusinessDay bugado
    const dt = new Date('2026-06-01T02:00:00Z') // = Dom 31/Mai 23:00 SP
    const result = getEffectiveSLAStart(dt, false, settings, [])
    expect(result.toISOString()).toBe('2026-06-01T12:00:00.000Z') // seg 09:00 SP
  })
})
