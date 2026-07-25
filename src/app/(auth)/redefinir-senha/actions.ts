'use server'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resetPasswordSchema } from '@/lib/validations/auth'
import { insertLog } from '@/lib/log'

export async function resetPasswordAction(
  prevState: { error: string } | null,
  formData: FormData
) {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    console.error('[resetPassword] Supabase error:', error.status, error.message)
    const serviceClient = await createServiceClient()
    await insertLog(
      serviceClient,
      'auth',
      'failure',
      'Falha ao redefinir senha (interno)',
      { supabase_error: error.message, status: error.status }
    )
    return { error: `Não foi possível redefinir a senha (${error.message}). Solicite uma nova redefinição.` }
  }

  redirect('/login?reset=success')
}
