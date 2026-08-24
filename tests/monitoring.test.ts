import { describe, it, expect } from 'vitest'
import {
  isWithinMonitoringWindow,
  mapZabbixSeverity,
  mapAzureMonitorSeverity,
} from '@/lib/monitoring'
import type { Database } from '@/types/database'

type MonitoringIntegration = Database['public']['Tables']['monitoring_integrations']['Row']

const baseIntegration: MonitoringIntegration = {
  id: 'uuid-1',
  company_id: 'uuid-2',
  connector_type: 'zabbix',
  webhook_token: 'uuid-token',
  window_type: '24x7',
  window_custom_days: null,
  window_custom_start: null,
  window_custom_end: null,
  out_of_window_behavior: 'descartar',
  is_active: true,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('isWithinMonitoringWindow', () => {
  it('24x7 sempre retorna true', () => {
    const integration = { ...baseIntegration, window_type: '24x7' as const }
    const now = new Date('2026-01-15T03:00:00-03:00')
    expect(isWithinMonitoringWindow(integration, now, [], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(true)
  })

  it('horario_comercial retorna false fora do horário', () => {
    const integration = { ...baseIntegration, window_type: 'horario_comercial' as const }
    const saturday = new Date('2026-01-17T10:00:00-03:00')
    expect(isWithinMonitoringWindow(integration, saturday, [], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(false)
  })

  it('horario_comercial retorna true dentro do horário comercial', () => {
    const integration = { ...baseIntegration, window_type: 'horario_comercial' as const }
    const weekday = new Date('2026-01-15T10:30:00-03:00')
    expect(isWithinMonitoringWindow(integration, weekday, [], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(true)
  })

  it('horario_comercial retorna false em feriado', () => {
    const integration = { ...baseIntegration, window_type: 'horario_comercial' as const }
    const holiday = new Date('2026-01-15T10:00:00-03:00')
    expect(isWithinMonitoringWindow(integration, holiday, ['2026-01-15'], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(false)
  })

  it('personalizado retorna true quando dentro da janela', () => {
    const integration = {
      ...baseIntegration,
      window_type: 'personalizado' as const,
      window_custom_days: [1, 2, 3, 4, 5],
      window_custom_start: '08:00',
      window_custom_end: '20:00',
    }
    const weekday = new Date('2026-01-15T09:00:00-03:00')
    expect(isWithinMonitoringWindow(integration, weekday, [], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(true)
  })

  it('personalizado retorna false fora dos dias configurados', () => {
    const integration = {
      ...baseIntegration,
      window_type: 'personalizado' as const,
      window_custom_days: [1, 2, 3, 4, 5],
      window_custom_start: '08:00',
      window_custom_end: '20:00',
    }
    const saturday = new Date('2026-01-17T10:00:00-03:00')
    expect(isWithinMonitoringWindow(integration, saturday, [], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(false)
  })
})

describe('mapZabbixSeverity', () => {
  it('Disaster → critica', () => { expect(mapZabbixSeverity('Disaster')).toBe('critica') })
  it('High → critica', () => { expect(mapZabbixSeverity('High')).toBe('critica') })
  it('Average → alta', () => { expect(mapZabbixSeverity('Average')).toBe('alta') })
  it('Warning → media', () => { expect(mapZabbixSeverity('Warning')).toBe('media') })
  it('Information → baixa', () => { expect(mapZabbixSeverity('Information')).toBe('baixa') })
  it('Not classified → baixa', () => { expect(mapZabbixSeverity('Not classified')).toBe('baixa') })
  it('valor desconhecido → baixa', () => { expect(mapZabbixSeverity('Outro')).toBe('baixa') })
})

describe('mapAzureMonitorSeverity', () => {
  it('Sev0 → critica', () => { expect(mapAzureMonitorSeverity('Sev0')).toBe('critica') })
  it('Critical → critica', () => { expect(mapAzureMonitorSeverity('Critical')).toBe('critica') })
  it('Sev1 → alta', () => { expect(mapAzureMonitorSeverity('Sev1')).toBe('alta') })
  it('Error → alta', () => { expect(mapAzureMonitorSeverity('Error')).toBe('alta') })
  it('Sev2 → media', () => { expect(mapAzureMonitorSeverity('Sev2')).toBe('media') })
  it('Warning → media', () => { expect(mapAzureMonitorSeverity('Warning')).toBe('media') })
  it('Sev3 → baixa', () => { expect(mapAzureMonitorSeverity('Sev3')).toBe('baixa') })
  it('Informational → baixa', () => { expect(mapAzureMonitorSeverity('Informational')).toBe('baixa') })
})
