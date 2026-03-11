'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'

const HEARTBEAT_INTERVAL = 60_000 // Update last_seen every 60s

/**
 * Tracks user presence: sets is_online=true on mount,
 * updates last_seen_at periodically, and sets is_online=false on unmount/tab close.
 */
export function usePresence() {
  const { user } = useAppStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!user) return

    const client = getSupabaseClient()
    if (!client) return

    // Set online + update last_seen
    async function setOnline() {
      await client!
        .from('profiles')
        .update({ is_online: true, last_seen_at: new Date().toISOString() })
        .eq('id', user!.id)
    }

    // Set offline + update last_seen
    async function setOffline() {
      // Use sendBeacon-compatible approach for tab close
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user!.id}`
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!anonKey) return

      // Try fetch first (works for normal navigation/cleanup)
      try {
        await client!
          .from('profiles')
          .update({ is_online: false, last_seen_at: new Date().toISOString() })
          .eq('id', user!.id)
      } catch {
        // Fallback: sendBeacon for tab close (best-effort)
        try {
          const body = JSON.stringify({ is_online: false, last_seen_at: new Date().toISOString() })
          navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))
        } catch {
          // Best effort
        }
      }
    }

    // Heartbeat: update last_seen periodically while tab is active
    async function heartbeat() {
      if (document.visibilityState === 'visible') {
        await client!
          .from('profiles')
          .update({ is_online: true, last_seen_at: new Date().toISOString() })
          .eq('id', user!.id)
      }
    }

    // Handle visibility change (tab focus/blur)
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        setOnline()
      } else {
        // Tab hidden — update last_seen but keep online (they might come back)
        client!
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', user!.id)
      }
    }

    // Handle tab close / navigate away
    function handleBeforeUnload() {
      setOffline()
    }

    // Initial: set online
    setOnline()

    // Start heartbeat
    intervalRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL)

    // Listen for visibility + unload events
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      // Cleanup: set offline
      setOffline()

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user])
}
