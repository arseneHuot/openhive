'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isConfigured, getSupabaseClient } from '@/lib/supabase/client'
import { Loader2, MessageSquare } from 'lucide-react'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    async function checkState() {
      // Check if Supabase is configured
      if (!isConfigured()) {
        router.replace('/setup')
        return
      }

      // Check if user is authenticated
      const client = getSupabaseClient()
      if (!client) {
        router.replace('/setup')
        return
      }

      const {
        data: { session },
      } = await client.auth.getSession()
      if (session) {
        router.replace('/workspace')
      } else {
        router.replace('/auth')
      }
    }

    checkState()
  }, [router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <MessageSquare className="h-12 w-12 text-primary" />
      <h1 className="text-2xl font-bold">OpenHive</h1>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}
