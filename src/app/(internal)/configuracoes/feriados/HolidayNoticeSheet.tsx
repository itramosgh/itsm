'use client'
import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { getHolidayNoticeDetailsAction } from './actions'

interface Detail {
  contact_id: string
  contact_name: string
  company_name: string | null
  email: string
  sent_at: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  holidayId: string
  holidayName: string
  holidayDate: string
}

export function HolidayNoticeSheet({ open, onOpenChange, holidayId, holidayName, holidayDate }: Props) {
  const [details, setDetails] = React.useState<Detail[] | null>(null)
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null)

  const fetchKey = open ? holidayId : null
  if (fetchKey !== loadedFor) {
    setLoadedFor(fetchKey)
    setDetails(null)
  }

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    getHolidayNoticeDetailsAction(holidayId).then(data => {
      if (!cancelled) setDetails(data)
    })
    return () => { cancelled = true }
  }, [open, holidayId])

  const loading = open && details === null

  const formattedDate = new Date(holidayDate + 'T12:00:00').toLocaleDateString('pt-BR')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="min-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Avisos enviados — {holidayName} ({formattedDate})</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && details?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum aviso enviado ainda para este feriado.</p>
          )}
          {!loading && details && details.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left font-medium">Contato</th>
                  <th className="py-2 text-left font-medium">Empresa</th>
                  <th className="py-2 text-left font-medium">E-mail</th>
                  <th className="py-2 text-left font-medium">Enviado em</th>
                </tr>
              </thead>
              <tbody>
                {details.map(d => (
                  <tr key={d.contact_id} className="border-b">
                    <td className="py-2 pr-3">{d.contact_name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{d.company_name ?? '—'}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{d.email}</td>
                    <td className="py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(d.sent_at).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
