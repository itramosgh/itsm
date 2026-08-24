export function nowMs(): number {
  return Date.now()
}

export function offsetIso(deltaMs: number): string {
  return new Date(nowMs() + deltaMs).toISOString()
}

export function offsetDateOnly(deltaMs: number): string {
  return offsetIso(deltaMs).slice(0, 10)
}

export function offsetDate(deltaMs: number): Date {
  return new Date(nowMs() + deltaMs)
}
