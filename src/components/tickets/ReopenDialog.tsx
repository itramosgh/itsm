'use client'
import { useState, useTransition } from 'react'
import { reopenTicketAction } from '@/app/(internal)/chamados/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { offsetDate } from '@/lib/date-math'

interface Props {
  ticketId: string
  closedAt: string
}

export function ReopenDialog({ ticketId, closedAt }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const sevenDaysAgo = offsetDate(-7 * 24 * 3_600_000)
  const isExpired = new Date(closedAt) < sevenDaysAgo

  if (isExpired) return null

  function handleReopen() {
    if (!reason.trim()) { setError('Informe o motivo da reabertura'); return }
    startTransition(async () => {
      const result = await reopenTicketAction(ticketId, reason)
      if (result?.error) { setError(result.error); return }
      setOpen(false)
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        🔄 Reabrir chamado
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir chamado</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="reason">Motivo da reabertura *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo..."
            />
            {error && <p className="text-sm text-destructive mt-1">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleReopen} disabled={isPending}>
              {isPending ? 'Reabrindo...' : 'Confirmar reabertura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
