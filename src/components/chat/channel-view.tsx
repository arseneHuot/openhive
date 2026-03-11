'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
import { ThreadPanel } from './thread-panel'
import { UserProfilePanel } from './user-profile-panel'
import { ChannelSettingsDialog } from './channel-settings-dialog'
import { CallSetupDialog } from '@/components/calls/call-setup-dialog'
import type { Channel, Message, ActiveCall } from '@/types/database'
import { Hash, Lock, Users, Loader2, LogIn, Phone, PhoneOff, Video, Menu } from 'lucide-react'
import { useMobile } from '@/hooks/use-mobile'

const PAGE_SIZE = 50

interface ChannelViewProps {
  channel: Channel
  isPreview?: boolean
}

export function ChannelView({ channel, isPreview = false }: ChannelViewProps) {
  const { user, workspace, threadParentMessage, profileUserId, dmChannels, openProfile, addChannel, setCurrentChannelId, setPreviewChannel, channelActiveCalls, setChannelActiveCall, joinCall, isInCall, toggleSidebar } = useAppStore()
  const { isMobile, isDesktop } = useMobile()
  const isDm = channel.name.startsWith('dm-')
  const isGroupDm = channel.name.startsWith('gdm-')
  const isDirectMessage = isDm || isGroupDm
  const dmInfo = isDirectMessage ? dmChannels.find((d) => d.id === channel.id) : null
  const displayChannelName = isGroupDm
    ? (dmInfo?.memberProfiles || []).map(m => m.display_name).join(', ') || 'Group DM'
    : isDm && dmInfo?.otherUser
      ? dmInfo.otherUser.display_name
      : channel.name
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false)
  const [joiningChannel, setJoiningChannel] = useState(false)
  const [startingCall, setStartingCall] = useState(false)
  const [callSetupOpen, setCallSetupOpen] = useState(false)
  const channelCall = channelActiveCalls[channel.id] || null
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Message[]>([])
  const isInitialLoad = useRef(true)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return

    const client = getSupabaseClient()
    if (!client) return

    setLoadingMore(true)
    const oldestMessage = messages[0]
    const scrollContainer = scrollContainerRef.current
    const prevScrollHeight = scrollContainer?.scrollHeight || 0

    const { data } = await client
      .from('messages')
      .select('*, sender:profiles(*)')
      .eq('channel_id', channel.id)
      .eq('is_deleted', false)
      .is('parent_id', null)
      .lt('created_at', oldestMessage.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (data) {
      const olderMessages = (data as Message[]).reverse()
      if (olderMessages.length < PAGE_SIZE) {
        setHasMore(false)
      }
      if (olderMessages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id))
          const unique = olderMessages.filter((m) => !existingIds.has(m.id))
          return [...unique, ...prev]
        })
        requestAnimationFrame(() => {
          if (scrollContainer) {
            const newScrollHeight = scrollContainer.scrollHeight
            scrollContainer.scrollTop = newScrollHeight - prevScrollHeight
          }
        })
      }
    }

    setLoadingMore(false)
  }, [loadingMore, hasMore, messages, channel.id])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    function handleScroll() {
      if (container!.scrollTop < 100 && !loadingMore && hasMore && !loading) {
        loadOlderMessages()
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [loadOlderMessages, loadingMore, hasMore, loading])

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) return

    async function loadMessages() {
      setLoading(true)
      setHasMore(true)
      isInitialLoad.current = true

      const { data } = await client!
        .from('messages')
        .select('*, sender:profiles(*)')
        .eq('channel_id', channel.id)
        .eq('is_deleted', false)
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (data) {
        const msgs = (data as Message[]).reverse()
        setMessages(msgs)
        if (data.length < PAGE_SIZE) {
          setHasMore(false)
        }
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'instant' })
          isInitialLoad.current = false
        }, 100)
      }
      setLoading(false)
    }

    async function fetchMessage(id: string): Promise<Message | null> {
      const { data } = await client!
        .from('messages')
        .select('*, sender:profiles(*)')
        .eq('id', id)
        .single()
      return data as Message | null
    }

    loadMessages()

    const channelSub = client
      .channel(`messages:${channel.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channel.id}`,
        },
        async (payload) => {
          if (payload.new.parent_id) return

          const fullMessage = await fetchMessage(payload.new.id)
          if (fullMessage) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === fullMessage.id)) return prev
              return [...prev, fullMessage]
            })
            const container = scrollContainerRef.current
            if (container) {
              const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200
              if (isNearBottom || payload.new.sender_id === user?.id) {
                scrollToBottom()
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channel.id}`,
        },
        async (payload) => {
          if (payload.new.is_deleted) {
            setMessages((prev) => prev.filter((m) => m.id !== payload.new.id))
          } else {
            const updated = await fetchMessage(payload.new.id)
            if (updated) {
              setMessages((prev) =>
                prev.map((m) => (m.id === updated.id ? updated : m))
              )
            }
          }
        }
      )
      .subscribe()

    return () => {
      channelSub.unsubscribe()
    }
  }, [channel.id, scrollToBottom, user?.id])

  async function handleSendMessage(content: string) {
    const client = getSupabaseClient()
    if (!client || !user) return

    await client.from('messages').insert({
      channel_id: channel.id,
      sender_id: user.id,
      content,
    })
  }

  async function handleJoinPreview() {
    const client = getSupabaseClient()
    if (!client || !user) return

    setJoiningChannel(true)
    try {
      await client.from('channel_members').insert({
        channel_id: channel.id,
        profile_id: user.id,
        role: 'member',
      })

      // Add to sidebar and switch to it
      addChannel(channel)
      setPreviewChannel(null)
      setCurrentChannelId(channel.id)
    } catch (err) {
      console.error('Failed to join channel:', err)
    }
    setJoiningChannel(false)
  }

  // Load active call for this channel
  useEffect(() => {
    const client = getSupabaseClient()
    if (!client || !workspace) return

    async function loadActiveCall() {
      const { data } = await client!
        .from('active_calls')
        .select('*')
        .eq('channel_id', channel.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)

      if (data && data.length > 0) {
        setChannelActiveCall(channel.id, data[0] as ActiveCall)
      } else {
        setChannelActiveCall(channel.id, null)
      }
    }

    loadActiveCall()

    // Subscribe to active_calls changes for this channel
    const callSub = client
      .channel(`calls:${channel.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_calls',
          filter: `channel_id=eq.${channel.id}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            setChannelActiveCall(channel.id, payload.new as ActiveCall)
          } else if (payload.eventType === 'UPDATE') {
            const call = payload.new as ActiveCall
            if (call.ended_at) {
              setChannelActiveCall(channel.id, null)
            } else {
              setChannelActiveCall(channel.id, call)
            }
          } else if (payload.eventType === 'DELETE') {
            setChannelActiveCall(channel.id, null)
          }
        }
      )
      .subscribe()

    return () => {
      callSub.unsubscribe()
    }
  }, [channel.id, workspace])

  async function handleStartOrJoinCall() {
    const client = getSupabaseClient()
    if (!client || !user || !workspace || isInCall) return

    setStartingCall(true)

    // Pre-flight: check if LiveKit is configured before creating any DB records
    if (!channelCall) {
      const { data: settings } = await client
        .from('workspace_settings')
        .select('*')
        .eq('workspace_id', workspace.id)
        .single()

      if (!settings?.calls_enabled || !settings?.livekit_url || !settings?.livekit_api_key || !settings?.livekit_api_secret) {
        setCallSetupOpen(true)
        setStartingCall(false)
        return
      }
    }

    let createdNewCall = false
    let call = channelCall

    try {
      // First, check if LiveKit is configured by requesting a pre-flight check
      const { data: { session } } = await client.auth.getSession()
      if (!session) throw new Error('No session')

      // If no active call, create one
      if (!call) {
        const roomName = `${workspace.id}-${channel.id}-${Date.now()}`
        const { data: newCall, error } = await client
          .from('active_calls')
          .insert({
            channel_id: channel.id,
            workspace_id: workspace.id,
            type: 'huddle',
            livekit_room_name: roomName,
            started_by: user.id,
          })
          .select()
          .single()

        if (error) throw error
        call = newCall as ActiveCall
        createdNewCall = true
        setChannelActiveCall(channel.id, call)
      }

      // Add participant record
      await client
        .from('call_participants')
        .upsert({
          call_id: call.id,
          profile_id: user.id,
          joined_at: new Date().toISOString(),
          left_at: null,
          is_muted: false,
          is_camera_on: false,
          is_sharing_screen: false,
        })

      // Request LiveKit token from API
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          roomName: call.livekit_room_name,
          workspaceId: workspace.id,
          identity: user.id,
          displayName: user.display_name,
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to get call token')
      }

      const { token, url } = await response.json()
      joinCall(call, token, url)
    } catch (err) {
      console.error('Failed to start/join call:', err)

      // Cleanup: if we created a new call but token failed, end the call
      if (createdNewCall && call) {
        try {
          await client
            .from('active_calls')
            .update({ ended_at: new Date().toISOString() })
            .eq('id', call.id)
        } catch { /* ignore cleanup errors */ }
        setChannelActiveCall(channel.id, null)
      } else if (call) {
        // Just remove our participant
        try {
          await client
            .from('call_participants')
            .update({ left_at: new Date().toISOString() })
            .eq('call_id', call.id)
            .eq('profile_id', user.id)
        } catch { /* ignore cleanup errors */ }
      }

      alert(err instanceof Error ? err.message : 'Failed to start call')
    }
    setStartingCall(false)
  }

  return (
    <div className="flex-1 flex h-full">
      {/* Main channel area */}
      <div className="flex-1 flex flex-col h-full min-w-0" style={{ background: '#ffffff' }}>
        {/* Channel header */}
        <div className="px-5 py-3 flex items-center justify-between shrink-0" style={{ background: '#ffffff', borderBottom: '1px solid #E5E1EE' }}>
          <div className="flex items-center gap-2.5">
            {!isDesktop && (
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[#F5F2FF] transition-colors mr-1"
              >
                <Menu className="h-5 w-5" style={{ color: '#8E8EA0' }} />
              </button>
            )}
            {isGroupDm ? (
              <>
                <div className="relative h-7 w-7 shrink-0">
                  {dmInfo?.memberProfiles?.[0]?.avatar_url ? (
                    <img src={dmInfo.memberProfiles[0].avatar_url} alt="" className="absolute top-0 left-0 h-[18px] w-[18px] rounded-md object-cover border-2 border-white" />
                  ) : (
                    <div className="absolute top-0 left-0 h-[18px] w-[18px] rounded-md flex items-center justify-center text-[8px] font-bold text-white border-2 border-white" style={{ background: '#7C5CFC' }}>
                      {dmInfo?.memberProfiles?.[0]?.display_name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  {dmInfo?.memberProfiles?.[1]?.avatar_url ? (
                    <img src={dmInfo.memberProfiles[1].avatar_url} alt="" className="absolute bottom-0 right-0 h-[18px] w-[18px] rounded-md object-cover border-2 border-white" />
                  ) : (
                    <div className="absolute bottom-0 right-0 h-[18px] w-[18px] rounded-md flex items-center justify-center text-[8px] font-bold text-white border-2 border-white" style={{ background: '#9B7DFF' }}>
                      {dmInfo?.memberProfiles?.[1]?.display_name?.[0]?.toUpperCase() || '+'}
                    </div>
                  )}
                </div>
                <h2 className="font-bold text-[17px] truncate max-w-md" style={{ color: '#2D2B3D' }}>
                  {displayChannelName}
                </h2>
                <span className="text-xs shrink-0 px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#EDE5FF', color: '#7C5CFC' }}>
                  {(dmInfo?.memberProfiles?.length || 0) + 1}
                </span>
              </>
            ) : isDm ? (
              <>
                {dmInfo?.otherUser?.avatar_url ? (
                  <img
                    src={dmInfo.otherUser.avatar_url}
                    alt={displayChannelName}
                    className="h-7 w-7 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: '#7C5CFC' }}>
                    {dmInfo?.otherUser?.display_name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <button
                  onClick={() => dmInfo?.otherUser?.id && openProfile(dmInfo.otherUser.id)}
                  className="font-bold text-[17px] hover:underline cursor-pointer"
                  style={{ color: '#2D2B3D' }}
                >
                  {displayChannelName}
                </button>
              </>
            ) : (
              <>
                <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: '#EDE5FF' }}>
                  {channel.is_private ? (
                    <Lock className="h-4 w-4" style={{ color: '#7C5CFC' }} />
                  ) : (
                    <Hash className="h-4 w-4" style={{ color: '#7C5CFC' }} />
                  )}
                </div>
                <h2 className="font-bold text-[17px]" style={{ color: '#2D2B3D' }}>{channel.name}</h2>
                {channel.description && (
                  <>
                    <span style={{ color: '#E5E1EE' }}>|</span>
                    <span className="text-sm truncate max-w-md" style={{ color: '#8E8EA0' }}>
                      {channel.description}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Call button */}
            {!isPreview && (
              <>
                {channelCall ? (
                  <button
                    onClick={handleStartOrJoinCall}
                    disabled={startingCall || isInCall}
                    className="h-8 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-[12px] font-semibold"
                    style={{ background: '#DCFCE7', color: '#16A34A' }}
                    title="Join active call"
                  >
                    {startingCall ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Phone className="h-3.5 w-3.5" />
                        <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: '#16A34A' }} />
                        Join
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleStartOrJoinCall}
                    disabled={startingCall || isInCall}
                    className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[#F5F2FF] transition-colors"
                    title="Start a call"
                  >
                    {startingCall ? (
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#7C5CFC' }} />
                    ) : (
                      <Phone className="h-4 w-4" style={{ color: '#8E8EA0' }} />
                    )}
                  </button>
                )}
              </>
            )}
            {!isDirectMessage && (
              <button
                onClick={() => setChannelSettingsOpen(true)}
                className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[#F5F2FF] transition-colors"
                title="Channel settings & members"
              >
                <Users className="h-4 w-4" style={{ color: '#8E8EA0' }} />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5">
          <div className="py-4 space-y-0.5">
            {loadingMore && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin mr-2" style={{ color: '#7C5CFC' }} />
                <span className="text-xs" style={{ color: '#8E8EA0' }}>Loading older messages...</span>
              </div>
            )}

            {!hasMore && messages.length > 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                {isDirectMessage ? (
                  <>
                    {isGroupDm ? (
                      <div className="relative h-14 w-14 mb-3">
                        {dmInfo?.memberProfiles?.[0]?.avatar_url ? (
                          <img src={dmInfo.memberProfiles[0].avatar_url} alt="" className="absolute top-0 left-0 h-9 w-9 rounded-xl object-cover border-2 border-white" />
                        ) : (
                          <div className="absolute top-0 left-0 h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold text-white border-2 border-white" style={{ background: '#7C5CFC' }}>
                            {dmInfo?.memberProfiles?.[0]?.display_name?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        {dmInfo?.memberProfiles?.[1]?.avatar_url ? (
                          <img src={dmInfo.memberProfiles[1].avatar_url} alt="" className="absolute bottom-0 right-0 h-9 w-9 rounded-xl object-cover border-2 border-white" />
                        ) : (
                          <div className="absolute bottom-0 right-0 h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold text-white border-2 border-white" style={{ background: '#9B7DFF' }}>
                            {dmInfo?.memberProfiles?.[1]?.display_name?.[0]?.toUpperCase() || '+'}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white mb-3" style={{ background: '#7C5CFC' }}>
                        {dmInfo?.otherUser?.avatar_url ? (
                          <img src={dmInfo.otherUser.avatar_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                        ) : (
                          dmInfo?.otherUser?.display_name?.[0]?.toUpperCase() || '?'
                        )}
                      </div>
                    )}
                    <h3 className="text-base font-bold" style={{ color: '#2D2B3D' }}>{displayChannelName}</h3>
                    <p className="text-sm" style={{ color: '#8E8EA0' }}>
                      This is the beginning of your conversation.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#EDE5FF' }}>
                      <Hash className="h-7 w-7" style={{ color: '#7C5CFC' }} />
                    </div>
                    <h3 className="text-base font-bold" style={{ color: '#2D2B3D' }}>Welcome to #{channel.name}!</h3>
                    <p className="text-sm" style={{ color: '#8E8EA0' }}>
                      This is the start of the #{channel.name} channel.
                    </p>
                  </>
                )}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12" style={{ color: '#8E8EA0' }}>
                <Loader2 className="h-5 w-5 animate-spin mr-2" style={{ color: '#7C5CFC' }} />
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                {isDirectMessage ? (
                  <>
                    {isGroupDm ? (
                      <div className="relative h-16 w-16 mb-4">
                        {dmInfo?.memberProfiles?.[0]?.avatar_url ? (
                          <img src={dmInfo.memberProfiles[0].avatar_url} alt="" className="absolute top-0 left-0 h-10 w-10 rounded-xl object-cover border-2 border-white" />
                        ) : (
                          <div className="absolute top-0 left-0 h-10 w-10 rounded-xl flex items-center justify-center text-lg font-bold text-white border-2 border-white" style={{ background: '#7C5CFC' }}>
                            {dmInfo?.memberProfiles?.[0]?.display_name?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        {dmInfo?.memberProfiles?.[1]?.avatar_url ? (
                          <img src={dmInfo.memberProfiles[1].avatar_url} alt="" className="absolute bottom-0 right-0 h-10 w-10 rounded-xl object-cover border-2 border-white" />
                        ) : (
                          <div className="absolute bottom-0 right-0 h-10 w-10 rounded-xl flex items-center justify-center text-lg font-bold text-white border-2 border-white" style={{ background: '#9B7DFF' }}>
                            {dmInfo?.memberProfiles?.[1]?.display_name?.[0]?.toUpperCase() || '+'}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white mb-4" style={{ background: '#7C5CFC' }}>
                        {dmInfo?.otherUser?.avatar_url ? (
                          <img src={dmInfo.otherUser.avatar_url} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                        ) : (
                          dmInfo?.otherUser?.display_name?.[0]?.toUpperCase() || '?'
                        )}
                      </div>
                    )}
                    <h3 className="text-lg font-bold" style={{ color: '#2D2B3D' }}>{displayChannelName}</h3>
                    <p style={{ color: '#8E8EA0' }}>
                      {isGroupDm
                        ? 'This is the start of your group conversation.'
                        : `This is the start of your conversation with ${displayChannelName}.`
                      }
                    </p>
                  </>
                ) : (
                  <>
                    <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#EDE5FF' }}>
                      <Hash className="h-8 w-8" style={{ color: '#7C5CFC' }} />
                    </div>
                    <h3 className="text-lg font-bold" style={{ color: '#2D2B3D' }}>Welcome to #{channel.name}!</h3>
                    <p style={{ color: '#8E8EA0' }}>
                      This is the start of the #{channel.name} channel.
                      {channel.description && ` ${channel.description}`}
                    </p>
                  </>
                )}
              </div>
            ) : (
              messages.map((message, i) => {
                const prevMessage = i > 0 ? messages[i - 1] : null
                const showHeader =
                  !prevMessage ||
                  prevMessage.sender_id !== message.sender_id ||
                  new Date(message.created_at).getTime() -
                    new Date(prevMessage.created_at).getTime() >
                    5 * 60 * 1000

                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    showHeader={showHeader}
                    isOwn={message.sender_id === user?.id}
                  />
                )
              })
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Active call banner */}
        {!isPreview && channelCall && !isInCall && (
          <div className="px-5 py-2 shrink-0" style={{ borderTop: '1px solid #E5E1EE' }}>
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: '#DCFCE7' }}>
              <div className="h-2.5 w-2.5 rounded-full animate-pulse shrink-0" style={{ background: '#16A34A' }} />
              <span className="text-[13px] font-medium flex-1" style={{ color: '#166534' }}>
                {isDirectMessage ? `${displayChannelName} is in a call` : 'A call is in progress in this channel'}
              </span>
              <button
                onClick={handleStartOrJoinCall}
                disabled={startingCall}
                className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all hover:opacity-90 flex items-center gap-1.5"
                style={{ background: '#16A34A' }}
              >
                {startingCall ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Phone className="h-3 w-3" />
                )}
                Join Call
              </button>
            </div>
          </div>
        )}

        {/* Message input or Join banner */}
        {isPreview ? (
          <div className="px-5 py-4 shrink-0" style={{ borderTop: '1px solid #E5E1EE' }}>
            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: '#F5F2FF' }}>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold" style={{ color: '#2D2B3D' }}>
                  You&apos;re previewing <strong>#{channel.name}</strong>
                </p>
                <p className="text-[13px]" style={{ color: '#8E8EA0' }}>
                  Join this channel to start sending messages
                </p>
              </div>
              <button
                onClick={handleJoinPreview}
                disabled={joiningChannel}
                className="px-6 py-2.5 rounded-xl text-[14px] font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2 shrink-0"
                style={{ background: '#7C5CFC' }}
              >
                {joiningChannel ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                Join Channel
              </button>
            </div>
          </div>
        ) : (
          <MessageInput
            channelId={channel.id}
            channelName={displayChannelName}
            onSend={handleSendMessage}
            placeholder={isDirectMessage ? `Message ${displayChannelName}` : undefined}
          />
        )}
      </div>

      {/* Thread panel */}
      {!isPreview && threadParentMessage && <ThreadPanel />}

      {/* User profile panel */}
      {!isPreview && profileUserId && <UserProfilePanel />}

      {/* Channel settings dialog */}
      {!isPreview && !isDirectMessage && (
        <ChannelSettingsDialog
          open={channelSettingsOpen}
          onOpenChange={setChannelSettingsOpen}
          channel={channel}
        />
      )}

      {/* Call setup dialog (shown when LiveKit is not configured) */}
      <CallSetupDialog
        open={callSetupOpen}
        onOpenChange={setCallSetupOpen}
      />
    </div>
  )
}
