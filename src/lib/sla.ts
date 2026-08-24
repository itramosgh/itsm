const SP_TIMEZONE = 'America/Sao_Paulo'

export interface BusinessHoursSettings {
  start: string
  end: string
  days: number[] // 1=Seg ... 7=Dom (ISO)
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number)
  return { hours: h, minutes: m }
}

/**
 * Returns date/time parts in São Paulo timezone.
 * Necessary because the server (Vercel) runs in UTC, but business hours
 * settings are expressed in São Paulo local time.
 */
function getSaoPauloDateParts(date: Date): {
  isoDay: number
  hours: number
  minutes: number
  dateStr: string
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: SP_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]))
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const jsDay = weekdayMap[parts.weekday] ?? 0
  const isoDay = jsDay === 0 ? 7 : jsDay
  const hours = parseInt(parts.hour === '24' ? '0' : parts.hour, 10)
  const minutes = parseInt(parts.minute, 10)
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`
  return { isoDay, hours, minutes, dateStr }
}

/**
 * Creates a Date (UTC) representing the given São Paulo local time (HH:MM:00)
 * on the same São Paulo calendar date as `date`.
 * São Paulo is permanently UTC-3 (DST abolished in 2019).
 */
function saoPauloDateAtTime(date: Date, hours: number, minutes: number): Date {
  const { dateStr } = getSaoPauloDateParts(date)
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  return new Date(`${dateStr}T${hh}:${mm}:00-03:00`)
}

function isDayInBusinessDays(date: Date, businessDays: number[], holidays: string[]): boolean {
  const { isoDay, dateStr } = getSaoPauloDateParts(date)
  if (!businessDays.includes(isoDay)) return false
  return !holidays.includes(dateStr)
}

export function isBusinessDay(
  date: Date,
  settings: BusinessHoursSettings,
  holidays: string[]
): boolean {
  return isDayInBusinessDays(date, settings.days, holidays)
}

function nextBusinessDayStart(
  date: Date,
  settings: BusinessHoursSettings,
  holidays: string[]
): Date {
  // Advance from the São Paulo calendar date of `date`, not from the UTC date
  const { dateStr } = getSaoPauloDateParts(date)
  const midnightSP = new Date(`${dateStr}T00:00:00-03:00`)
  let next = new Date(midnightSP.getTime() + 24 * 60 * 60_000) // SP next day at midnight

  while (!isBusinessDay(next, settings, holidays)) {
    next = new Date(next.getTime() + 24 * 60 * 60_000)
  }

  const { hours, minutes } = parseTime(settings.start)
  return saoPauloDateAtTime(next, hours, minutes)
}

export function getEffectiveSLAStart(
  createdAt: Date,
  is24x7: boolean,
  settings: BusinessHoursSettings,
  holidays: string[]
): Date {
  if (is24x7) return createdAt

  const startTime = parseTime(settings.start)
  const endTime = parseTime(settings.end)
  const startMins = startTime.hours * 60 + startTime.minutes
  const endMins = endTime.hours * 60 + endTime.minutes

  if (!isBusinessDay(createdAt, settings, holidays)) {
    return nextBusinessDayStart(createdAt, settings, holidays)
  }

  const { hours, minutes } = getSaoPauloDateParts(createdAt)
  const currentMins = hours * 60 + minutes

  if (currentMins < startMins) {
    return saoPauloDateAtTime(createdAt, startTime.hours, startTime.minutes)
  }

  if (currentMins >= endMins) {
    return nextBusinessDayStart(createdAt, settings, holidays)
  }

  return createdAt
}

export function addBusinessHours(
  start: Date,
  hours: number,
  settings: BusinessHoursSettings,
  holidays: string[]
): Date {
  let remainingMinutes = hours * 60
  let current = new Date(start)

  const startTime = parseTime(settings.start)
  const endTime = parseTime(settings.end)
  const startMins = startTime.hours * 60 + startTime.minutes
  const endMins = endTime.hours * 60 + endTime.minutes

  while (remainingMinutes > 0) {
    if (!isBusinessDay(current, settings, holidays)) {
      current = nextBusinessDayStart(current, settings, holidays)
      continue
    }

    const { hours: spHours, minutes: spMinutes } = getSaoPauloDateParts(current)
    let currentMins = spHours * 60 + spMinutes

    if (currentMins < startMins) {
      current = saoPauloDateAtTime(current, startTime.hours, startTime.minutes)
      currentMins = startMins
    }

    if (currentMins >= endMins) {
      current = nextBusinessDayStart(current, settings, holidays)
      continue
    }

    const minutesAvailable = endMins - currentMins

    if (remainingMinutes <= minutesAvailable) {
      return new Date(current.getTime() + remainingMinutes * 60_000)
    }

    remainingMinutes -= minutesAvailable
    current = nextBusinessDayStart(current, settings, holidays)
  }

  return current
}

/**
 * Adds `hours` to `start`, skipping non-business days entirely (weekend and
 * holiday), counting 24h straight through on business days — unlike
 * addBusinessHours, this does not restrict to the office-hours window.
 */
export function addBusinessDays(
  start: Date,
  hours: number,
  businessDays: number[],
  holidays: string[]
): Date {
  let remainingMs = hours * 3_600_000
  let current = new Date(start)

  while (remainingMs > 0) {
    const { dateStr } = getSaoPauloDateParts(current)
    const midnightSP = new Date(`${dateStr}T00:00:00-03:00`)
    const nextMidnightSP = new Date(midnightSP.getTime() + 24 * 60 * 60_000)
    const msToDayEnd = nextMidnightSP.getTime() - current.getTime()

    if (isDayInBusinessDays(current, businessDays, holidays)) {
      if (remainingMs <= msToDayEnd) {
        return new Date(current.getTime() + remainingMs)
      }
      remainingMs -= msToDayEnd
    }

    current = nextMidnightSP
  }

  return current
}

export function calculateDeadline(params: {
  createdAt: Date
  responseHours: number
  is24x7: boolean
  settings: BusinessHoursSettings
  holidays: string[]
}): Date {
  const { createdAt, responseHours, is24x7, settings, holidays } = params

  if (is24x7) {
    return new Date(createdAt.getTime() + responseHours * 60 * 60_000)
  }

  return addBusinessHours(createdAt, responseHours, settings, holidays)
}

export function getSLARemainingMinutes(
  deadline: Date,
  pausedAt: Date | null
): number {
  const now = new Date()
  const currentPauseMs = pausedAt ? now.getTime() - pausedAt.getTime() : 0
  return Math.floor((deadline.getTime() - now.getTime() + currentPauseMs) / 60_000)
}

export function getSLAPercentUsed(
  slaStartsAt: Date,
  deadline: Date,
  pausedAt: Date | null
): number {
  const totalMs = deadline.getTime() - slaStartsAt.getTime()
  const remainingMs = getSLARemainingMinutes(deadline, pausedAt) * 60_000
  if (totalMs <= 0) return 100
  return Math.max(0, Math.min(100, Math.round(((totalMs - remainingMs) / totalMs) * 100)))
}
