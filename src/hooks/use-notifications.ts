'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import type { Message } from '@/types/database'

export function useNotifications() {
  const { user, workspace, currentChannelId } = useAppStore()
  const permissionRef = useRef<NotificationPermission>('default')

  // Request notification permission
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return

    if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        permissionRef.current = p
      })
    } else {
      permissionRef.current = Notification.permission
    }
  }, [])

  // Subscribe to mentions and DMs — push to activity panel + browser notifications
  useEffect(() => {
    if (!user || !workspace) return
    const client = getSupabaseClient()
    if (!client) return

    const sub = client
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const msg = payload.new as {
            id: string
            channel_id: string
            sender_id: string
            content: string
            parent_id: string | null
            created_at: string
          }

          // Don't notify for own messages — but mark activities for that channel as read
          // (the user is clearly active in this channel)
          if (msg.sender_id === user.id) {
            const s = useAppStore.getState()
            let readCount = 0
            const updated = s.activities.map((a) => {
              if (a.channelId === msg.channel_id && !a.read) {
                readCount++
                return { ...a, read: true }
              }
              return a
            })
            if (readCount > 0) {
              useAppStore.setState({
                activities: updated,
                unreadActivityCount: Math.max(0, s.unreadActivityCount - readCount),
              })
            }
            return
          }

          const state = useAppStore.getState()

          // Skip activity + browser notifications for muted channels
          if (state.mutedChannelIds.includes(msg.channel_id)) return

          // Check if it's a mention of the current user
          const isMention = msg.content.includes(`@${user.id}`)
          // Check if it's a DM
          const isDm = state.dmChannels.some((dm) => dm.id === msg.channel_id)
          // Check if it's a thread reply to one of our messages (would need parent message)
          const isThreadReply = !!msg.parent_id

          if (!isMention && !isDm && !isThreadReply) return

          // Fetch the full message with sender info for the activity panel
          const { data: fullMsg } = await client
            .from('messages')
            .select('*, sender:profiles(*)')
            .eq('id', msg.id)
            .single()

          if (!fullMsg) return

          // Determine channel name for display
          let channelName = ''
          const allChannels = [...state.channels, ...state.dmChannels]
          const ch = allChannels.find((c) => c.id === msg.channel_id)
          if (ch) {
            if (ch.name.startsWith('dm-')) {
              const dmCh = state.dmChannels.find((d) => d.id === ch.id)
              channelName = dmCh?.otherUser?.display_name || 'Direct Message'
            } else {
              channelName = ch.name
            }
          }

          // Determine activity type
          let activityType: 'mention' | 'dm' | 'thread_reply' = 'dm'
          if (isMention) activityType = 'mention'
          else if (isDm) activityType = 'dm'
          else if (isThreadReply) activityType = 'thread_reply'

          // Add to activity panel
          useAppStore.getState().addActivity({
            id: msg.id,
            type: activityType,
            message: fullMsg as Message,
            channelId: msg.channel_id,
            channelName,
            timestamp: msg.created_at,
            read: false,
          })

          // Don't send browser notification for current channel
          if (msg.channel_id === state.currentChannelId) return

          // Send browser notification
          sendBrowserNotification(
            { content: msg.content, sender_id: msg.sender_id, channel_id: msg.channel_id },
            isDm,
            isMention,
            (fullMsg as Message).sender?.display_name
          )
        }
      )
      .subscribe()

    return () => {
      sub.unsubscribe()
    }
  }, [user, workspace, currentChannelId])

  function sendBrowserNotification(
    msg: { content: string; sender_id: string; channel_id: string },
    isDm: boolean,
    isMention: boolean,
    senderName?: string
  ) {
    if (permissionRef.current !== 'granted') return
    if (typeof window === 'undefined' || !('Notification' in window)) return

    // Don't send if window is focused
    if (document.hasFocus()) return

    const title = isDm
      ? `${senderName || 'Someone'} sent you a message`
      : isMention
        ? `${senderName || 'Someone'} mentioned you`
        : 'New activity'
    const body = msg.content
      .replace(/@[a-f0-9-]+/g, '@user')
      .slice(0, 100)

    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: msg.channel_id,
    })

    notification.onclick = () => {
      window.focus()
      useAppStore.getState().setCurrentChannelId(msg.channel_id)
      notification.close()
    }
  }
}
