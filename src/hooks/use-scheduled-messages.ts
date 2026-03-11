'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'

export function useScheduledMessages() {
  const { user, workspace } = useAppStore()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!user || !workspace) return

    async function checkScheduledMessages() {
      const client = getSupabaseClient()
      if (!client) return

      const now = new Date().toISOString()

      const { data: dueMessages } = await client
        .from('scheduled_messages')
        .select('*')
        .eq('user_id', user!.id)
        .eq('workspace_id', workspace!.id)
        .eq('sent', false)
        .lte('scheduled_for', now)

      if (!dueMessages || dueMessages.length === 0) return

      for (const msg of dueMessages) {
        try {
          // Send the message
          await client.from('messages').insert({
            channel_id: msg.channel_id,
            sender_id: user!.id,
            content: msg.content,
          })

          // Mark as sent
          await client
            .from('scheduled_messages')
            .update({ sent: true })
            .eq('id', msg.id)
        } catch (err) {
          console.error('Failed to send scheduled message:', err)
        }
      }
    }

    // Check immediately on mount
    checkScheduledMessages()

    // Then poll every 30 seconds
    intervalRef.current = setInterval(checkScheduledMessages, 30000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [user, workspace])
}
