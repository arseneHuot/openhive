'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Phone, X } from 'lucide-react'
import { useAppStore } from '@/lib/store/app-store'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { ActiveCall } from '@/types/database'

export function IncomingCallBanner() {
  const { user, channels, dmChannels, channelActiveCalls, isInCall, joinCall, setChannelActiveCall } = useAppStore()
  const [incomingCall, setIncomingCall] = useState<{ call: ActiveCall; callerName: string; channelName: string } | null>(null)
  const [dismissedCallIds, setDismissedCallIds] = useState<Set<string>>(new Set())
  const [joining, setJoining] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Play ringtone using Web Audio API
  const startRingtone = useCallback(() => {
    try {
      const ctx = new AudioContext()
      audioContextRef.current = ctx

      // Create a ringing pattern: beep-beep ... beep-beep
      let beepCount = 0

      function playBeep() {
        if (!audioContextRef.current) return
        const osc = audioContextRef.current.createOscillator()
        const gain = audioContextRef.current.createGain()

        osc.connect(gain)
        gain.connect(audioContextRef.current.destination)

        osc.frequency.value = beepCount % 2 === 0 ? 440 : 554 // A4 and C#5 alternating
        osc.type = 'sine'
        gain.gain.value = 0.15

        osc.start()
        osc.stop(audioContextRef.current.currentTime + 0.15)
        beepCount++
      }

      // Play pattern: two quick beeps, pause, repeat
      playBeep()
      setTimeout(() => playBeep(), 200)

      ringtoneIntervalRef.current = setInterval(() => {
        playBeep()
        setTimeout(() => playBeep(), 200)
      }, 1500)
    } catch (e) {
      console.warn('Could not play ringtone:', e)
    }
  }, [])

  const stopRingtone = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current)
      ringtoneIntervalRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
  }, [])

  // Watch for new calls in channels the user belongs to
  useEffect(() => {
    if (!user || isInCall) {
      setIncomingCall(null)
      stopRingtone()
      return
    }

    const client = getSupabaseClient()
    if (!client) return

    const callSub = client
      .channel('incoming-call-watcher')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'active_calls' },
        async (payload) => {
          const call = payload.new as ActiveCall

          // Don't ring for our own calls
          if (call.started_by === user.id) return

          // Don't ring for dismissed calls
          if (dismissedCallIds.has(call.id)) return

          // Already in a call
          if (useAppStore.getState().isInCall) return

          // Check if user is a member of this channel
          const { data: membership } = await client
            .from('channel_members')
            .select('profile_id')
            .eq('channel_id', call.channel_id)
            .eq('profile_id', user.id)
            .single()

          if (!membership) return

          // Get caller name
          const { data: caller } = await client
            .from('profiles')
            .select('display_name')
            .eq('id', call.started_by)
            .single()

          // Get channel name
          const allChannels = [...useAppStore.getState().channels, ...useAppStore.getState().dmChannels]
          const ch = allChannels.find(c => c.id === call.channel_id)
          const dmInfo = useAppStore.getState().dmChannels.find(d => d.id === call.channel_id)
          const channelName = ch?.name.startsWith('dm-') && dmInfo?.otherUser
            ? dmInfo.otherUser.display_name
            : ch?.name ? `#${ch.name}` : 'Unknown'

          setIncomingCall({
            call,
            callerName: caller?.display_name || 'Someone',
            channelName,
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'active_calls' },
        (payload) => {
          const call = payload.new as ActiveCall
          // If call was ended, dismiss the banner
          if (call.ended_at && incomingCall?.call.id === call.id) {
            setIncomingCall(null)
            stopRingtone()
          }
        }
      )
      .subscribe()

    return () => {
      callSub.unsubscribe()
    }
  }, [user, isInCall, dismissedCallIds, incomingCall?.call.id, stopRingtone])

  // Play ringtone when incoming call appears
  useEffect(() => {
    if (incomingCall) {
      startRingtone()

      // Auto-dismiss after 30 seconds
      dismissTimerRef.current = setTimeout(() => {
        setIncomingCall(null)
        stopRingtone()
      }, 30000)
    } else {
      stopRingtone()
    }

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      stopRingtone()
    }
  }, [incomingCall?.call.id, startRingtone, stopRingtone])

  async function handleJoin() {
    if (!incomingCall || !user) return

    setJoining(true)
    stopRingtone()

    const client = getSupabaseClient()
    if (!client) return

    try {
      const { data: { session } } = await client.auth.getSession()
      if (!session) return

      // Add participant record
      await client.from('call_participants').upsert({
        call_id: incomingCall.call.id,
        profile_id: user.id,
        joined_at: new Date().toISOString(),
        left_at: null,
        is_muted: false,
        is_camera_on: false,
        is_sharing_screen: false,
      })

      // Get token
      const workspace = useAppStore.getState().workspace
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          roomName: incomingCall.call.livekit_room_name,
          workspaceId: workspace?.id,
          identity: user.id,
          displayName: user.display_name,
        }),
      })

      if (!response.ok) throw new Error('Failed to get token')

      const { token, url } = await response.json()
      joinCall(incomingCall.call, token, url)

      // Switch to the call's channel
      useAppStore.getState().setCurrentChannelId(incomingCall.call.channel_id)

      setIncomingCall(null)
    } catch (err) {
      console.error('Failed to join call:', err)
    }
    setJoining(false)
  }

  function handleDismiss() {
    if (incomingCall) {
      setDismissedCallIds(prev => new Set([...prev, incomingCall.call.id]))
    }
    setIncomingCall(null)
    stopRingtone()
  }

  if (!incomingCall) return null

  return (
    <div className="absolute top-0 left-0 right-0 z-50 animate-in slide-in-from-top-2 duration-300">
      <div className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg" style={{ background: '#7C5CFC' }}>
        <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 animate-pulse" style={{ background: 'rgba(255,255,255,0.2)' }}>
          <Phone className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {incomingCall.callerName} is calling
          </p>
          <p className="text-xs text-white/70 truncate">
            in {incomingCall.channelName}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDismiss}
            className="h-9 px-4 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
          >
            <X className="h-3.5 w-3.5" />
            Dismiss
          </button>
          <button
            onClick={handleJoin}
            disabled={joining}
            className="h-9 px-4 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
            style={{ background: '#22C55E', color: '#fff' }}
          >
            <Phone className="h-3.5 w-3.5" />
            {joining ? 'Joining...' : 'Join Call'}
          </button>
        </div>
      </div>
    </div>
  )
}
