'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store/app-store'
import { getSupabaseClient } from '@/lib/supabase/client'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Hash,
  Lock,
  Plus,
  LogOut,
  ChevronDown,
  ChevronRight,
  Circle,
  UserPlus,
  Search,
  PenSquare,
  Bell,
  BellOff,
  X,
  Compass,
  Phone,
  Bookmark,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CreateChannelDialog } from './create-channel-dialog'
import { DmDialog } from './dm-dialog'
import { BrowseChannelsDialog } from './browse-channels-dialog'
import { InviteDialog } from '@/components/workspace/invite-dialog'
import { WorkspaceSettingsDialog } from '@/components/workspace/workspace-settings-dialog'
import { SearchDialog } from '@/components/search/search-dialog'
import { ProfileEditDialog } from '@/components/profile/profile-edit-dialog'
import { SavedItemsPanel } from '@/components/bookmarks/saved-items-panel'
import type { Profile, Channel, ActiveCall } from '@/types/database'

interface SidebarProps {
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const router = useRouter()
  const {
    user, workspace, channels, dmChannels, currentChannelId,
    setCurrentChannelId, setDmChannels, toggleActivity, unreadActivityCount,
    hiddenDmIds, hideDm, unreadCounts, mutedChannelIds, muteChannel, unmuteChannel,
    channelActiveCalls, setChannelActiveCall,
  } = useAppStore()
  const [channelsOpen, setChannelsOpen] = useState(true)
  const [dmsOpen, setDmsOpen] = useState(true)
  const [createChannelOpen, setCreateChannelOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [dmDialogOpen, setDmDialogOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false)
  const [savedItemsOpen, setSavedItemsOpen] = useState(false)

  // Load DM channels + subscribe to new DMs + track unread in real-time
  useEffect(() => {
    if (!workspace || !user) return
    const client = getSupabaseClient()
    if (!client) return

    async function loadDms() {
      const { data: myChannels } = await client!
        .from('channel_members')
        .select('channel_id')
        .eq('profile_id', user!.id)

      if (!myChannels) return

      const channelIds = myChannels.map((c) => c.channel_id)
      if (channelIds.length === 0) return

      const { data: dms } = await client!
        .from('channels')
        .select('*')
        .eq('workspace_id', workspace!.id)
        .or('name.like.dm-%,name.like.gdm-%')
        .in('id', channelIds)

      if (!dms || dms.length === 0) return

      const dmWithUsers: (Channel & { otherUser?: Profile; memberProfiles?: Profile[] })[] = []

      for (const dm of dms) {
        const { data: members } = await client!
          .from('channel_members')
          .select('profile_id, profile:profiles(*)')
          .eq('channel_id', dm.id)

        if (dm.name.startsWith('gdm-')) {
          // Group DM: collect all other members
          const otherMembers = members
            ?.filter(m => m.profile_id !== user!.id)
            .map(m => m.profile as unknown as Profile)
            .filter(Boolean) || []
          dmWithUsers.push({
            ...dm,
            memberProfiles: otherMembers,
          })
        } else {
          // Regular DM: single other user
          const other = members?.find((m) => m.profile_id !== user!.id)
          dmWithUsers.push({
            ...dm,
            otherUser: other?.profile as unknown as Profile | undefined,
          })
        }
      }

      setDmChannels(dmWithUsers)
    }

    loadDms()

    // Subscribe to new messages — track unread + auto-add DM channels
    const newMsgSub = client
      .channel('sidebar-dm-watcher')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const msg = payload.new as { channel_id: string; sender_id: string }
          if (msg.sender_id === user!.id) return

          const state = useAppStore.getState()

          // Track unread count for any channel in sidebar (if not currently viewing)
          if (msg.channel_id !== state.currentChannelId) {
            const isKnownChannel =
              state.channels.some((c) => c.id === msg.channel_id) ||
              state.dmChannels.some((d) => d.id === msg.channel_id)
            if (isKnownChannel) {
              state.incrementUnread(msg.channel_id)
            }
          }

          // Check if this channel is already in our DM list
          if (state.dmChannels.some((d) => d.id === msg.channel_id)) return

          // Check if this is a DM or group DM channel we're a member of
          const { data: ch } = await client!
            .from('channels')
            .select('*')
            .eq('id', msg.channel_id)
            .or('name.like.dm-%,name.like.gdm-%')
            .single()

          if (!ch) return

          // Verify we're a member
          const { data: membership } = await client!
            .from('channel_members')
            .select('profile_id')
            .eq('channel_id', ch.id)
            .eq('profile_id', user!.id)
            .single()

          if (!membership) return

          // Load the members
          const { data: members } = await client!
            .from('channel_members')
            .select('profile_id, profile:profiles(*)')
            .eq('channel_id', ch.id)

          if (ch.name.startsWith('gdm-')) {
            const otherMembers = members
              ?.filter((m) => m.profile_id !== user!.id)
              .map(m => m.profile as unknown as Profile)
              .filter(Boolean) || []
            useAppStore.getState().addDmChannel({
              ...ch,
              memberProfiles: otherMembers,
            })
          } else {
            const other = members?.find((m) => m.profile_id !== user!.id)
            useAppStore.getState().addDmChannel({
              ...ch,
              otherUser: other?.profile as unknown as Profile | undefined,
            })
          }
        }
      )
      .subscribe()

    // Subscribe to channel_members changes — detect when user is removed from a channel
    const membershipSub = client
      .channel('sidebar-membership-watcher')
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'channel_members' },
        (payload) => {
          const old = payload.old as { channel_id?: string; profile_id?: string }
          if (old.profile_id === user!.id && old.channel_id) {
            const state = useAppStore.getState()
            const isDm = state.dmChannels.some((d) => d.id === old.channel_id)
            if (isDm) {
              state.setDmChannels(state.dmChannels.filter((d) => d.id !== old.channel_id))
            } else {
              state.removeChannel(old.channel_id!)
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'channel_members' },
        async (payload) => {
          const row = payload.new as { channel_id: string; profile_id: string; role: string }
          if (row.profile_id !== user!.id) return

          const state = useAppStore.getState()
          if (state.channels.some((c) => c.id === row.channel_id)) return
          if (state.dmChannels.some((d) => d.id === row.channel_id)) return

          const { data: ch } = await client!
            .from('channels')
            .select('*')
            .eq('id', row.channel_id)
            .single()

          if (!ch) return

          if (ch.name.startsWith('dm-') || ch.name.startsWith('gdm-')) {
            const { data: members } = await client!
              .from('channel_members')
              .select('profile_id, profile:profiles(*)')
              .eq('channel_id', ch.id)

            if (ch.name.startsWith('gdm-')) {
              const otherMembers = members
                ?.filter((m) => m.profile_id !== user!.id)
                .map(m => m.profile as unknown as Profile)
                .filter(Boolean) || []
              useAppStore.getState().addDmChannel({
                ...ch,
                memberProfiles: otherMembers,
              })
            } else {
              const other = members?.find((m) => m.profile_id !== user!.id)
              useAppStore.getState().addDmChannel({
                ...ch,
                otherUser: other?.profile as unknown as Profile | undefined,
              })
            }
          } else {
            useAppStore.getState().addChannel(ch as Channel)
          }
        }
      )
      .subscribe()

    return () => {
      newMsgSub.unsubscribe()
      membershipSub.unsubscribe()
    }
  }, [workspace, user, setDmChannels])

  // ⌘K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Load & subscribe to active calls across workspace
  useEffect(() => {
    if (!workspace) return
    const client = getSupabaseClient()
    if (!client) return

    async function loadActiveCalls() {
      const { data } = await client!
        .from('active_calls')
        .select('*')
        .eq('workspace_id', workspace!.id)
        .is('ended_at', null)

      if (data) {
        data.forEach((call: ActiveCall) => {
          setChannelActiveCall(call.channel_id, call)
        })
      }
    }

    loadActiveCalls()

    const callsSub = client
      .channel('sidebar-calls-watcher')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_calls',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const call = payload.new as ActiveCall
            if (call.workspace_id === workspace!.id) {
              setChannelActiveCall(call.channel_id, call)
            }
          } else if (payload.eventType === 'UPDATE') {
            const call = payload.new as ActiveCall
            if (call.workspace_id === workspace!.id) {
              if (call.ended_at) {
                setChannelActiveCall(call.channel_id, null)
              } else {
                setChannelActiveCall(call.channel_id, call)
              }
            }
          }
        }
      )
      .subscribe()

    return () => {
      callsSub.unsubscribe()
    }
  }, [workspace])

  async function handleSignOut() {
    const client = getSupabaseClient()
    if (client) {
      await client.auth.signOut()
    }
    useAppStore.getState().signOut()
    router.push('/auth')
  }

  const regularChannels = channels.filter((c) => !c.name.startsWith('dm-') && !c.name.startsWith('gdm-'))

  // Sort channels: unmuted first (alphabetical), then muted (alphabetical)
  const sortedChannels = [...regularChannels].sort((a, b) => {
    const aMuted = mutedChannelIds.includes(a.id)
    const bMuted = mutedChannelIds.includes(b.id)
    if (aMuted !== bMuted) return aMuted ? 1 : -1
    return a.name.localeCompare(b.name)
  })

  return (
    <>
      <div className="w-[260px] flex flex-col h-full" style={{ background: '#F0EBFF', borderRight: '1px solid #DDD6F3' }}>
        {/* Workspace header */}
        <div className="px-4 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid #DDD6F3' }}>
          <button
            onClick={() => setWorkspaceSettingsOpen(true)}
            className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
          >
            <div className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: '#7C5CFC' }}>
              {(workspace?.name || 'O')[0]?.toUpperCase()}
            </div>
            <span className="font-[800] text-[16px] truncate" style={{ color: '#2D2B3D' }}>{workspace?.name || 'OpenHive'}</span>
          </button>
          <button
            onClick={() => setDmDialogOpen(true)}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-all hover:bg-[#E0D6FF]"
          >
            <PenSquare className="h-4 w-4" style={{ color: '#8E8EA0' }} />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-3 pt-3 pb-1">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-[13px] hover:shadow-sm"
            style={{ background: '#ffffff', color: '#8E8EA0', border: '1px solid #E5E1EE' }}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded-md font-mono" style={{ background: '#F5F2FF', color: '#8E8EA0' }}>⌘K</kbd>
          </button>
        </div>

        {/* Activity button */}
        <div className="px-3 pb-1 pt-1">
          <button
            onClick={toggleActivity}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-[13px] hover:shadow-sm relative"
            style={{ background: '#ffffff', color: '#4A4860', border: '1px solid #E5E1EE' }}
          >
            <Bell className="h-3.5 w-3.5" style={{ color: '#7C5CFC' }} />
            <span className="flex-1 text-left font-medium">Activity</span>
            {unreadActivityCount > 0 && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white min-w-[18px] text-center"
                style={{ background: '#E55B5B' }}
              >
                {unreadActivityCount > 99 ? '99+' : unreadActivityCount}
              </span>
            )}
          </button>
        </div>

        {/* Saved Items button */}
        <div className="px-3 pb-1">
          <button
            onClick={() => setSavedItemsOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-[13px] hover:shadow-sm"
            style={{ background: '#ffffff', color: '#4A4860', border: '1px solid #E5E1EE' }}
          >
            <Bookmark className="h-3.5 w-3.5" style={{ color: '#7C5CFC' }} />
            <span className="flex-1 text-left font-medium">Saved Items</span>
          </button>
        </div>

        {/* Channel list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-2 pt-3 pb-2">
            {/* Channels section */}
            <div className="flex items-center justify-between px-2 py-0.5 mb-0.5">
              <button
                onClick={() => setChannelsOpen(!channelsOpen)}
                className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wider transition-colors hover:text-[#2D2B3D]"
                style={{ color: '#8E8EA0' }}
              >
                {channelsOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Channels
              </button>
              <button
                className="h-6 w-6 rounded-md flex items-center justify-center transition-all hover:bg-[#E0D6FF]"
                onClick={() => setCreateChannelOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" style={{ color: '#8E8EA0' }} />
              </button>
            </div>

            {channelsOpen && (
              <div className="space-y-0.5">
                {sortedChannels.map((channel) => {
                  const isActive = currentChannelId === channel.id
                  const isMuted = mutedChannelIds.includes(channel.id)
                  const unreadCount = unreadCounts[channel.id] || 0
                  const hasActiveCall = !!channelActiveCalls[channel.id]

                  return (
                    <div key={channel.id} className="group relative">
                      <button
                        onClick={() => { setCurrentChannelId(channel.id); onNavigate?.() }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-[6px] rounded-lg text-[14px] transition-all',
                          isActive
                            ? 'text-white font-semibold shadow-sm'
                            : 'hover:bg-[#E0D6FF]'
                        )}
                        style={{
                          background: isActive ? '#7C5CFC' : undefined,
                          color: isActive ? '#fff' : isMuted ? '#A9A6B8' : '#4A4860',
                        }}
                      >
                        {channel.is_private ? (
                          <Lock className={cn('h-3.5 w-3.5 shrink-0', isMuted && !isActive ? 'opacity-40' : 'opacity-70')} />
                        ) : (
                          <Hash className={cn('h-4 w-4 shrink-0', isMuted && !isActive ? 'opacity-40' : 'opacity-70')} />
                        )}
                        <span className={cn('truncate flex-1 text-left', isMuted && !isActive && 'opacity-60')}>
                          {channel.name}
                        </span>
                        {hasActiveCall && (
                          <Phone className="h-3 w-3 shrink-0 text-green-500" />
                        )}
                        {isMuted && !isActive && !hasActiveCall && (
                          <BellOff className="h-3 w-3 shrink-0 opacity-30" />
                        )}
                        {unreadCount > 0 && !isActive && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white min-w-[18px] text-center shrink-0"
                            style={{ background: isMuted ? '#A9A6B8' : '#7C5CFC' }}
                          >
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </button>
                      {/* Mute/unmute toggle on hover */}
                      {!isActive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            isMuted ? unmuteChannel(channel.id) : muteChannel(channel.id)
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#DDD6F3]"
                          title={isMuted ? 'Unmute channel' : 'Mute channel'}
                          style={{ color: '#8E8EA0' }}
                        >
                          {isMuted ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                  )
                })}

                {/* Browse channels button */}
                <button
                  onClick={() => setBrowseOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-[6px] rounded-lg text-[14px] transition-all hover:bg-[#E0D6FF]"
                  style={{ color: '#8E8EA0' }}
                >
                  <Compass className="h-4 w-4 shrink-0" />
                  <span>Browse channels</span>
                </button>
              </div>
            )}

            {/* Direct Messages section */}
            <div className="flex items-center justify-between px-2 py-0.5 mt-5 mb-0.5">
              <button
                onClick={() => setDmsOpen(!dmsOpen)}
                className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wider transition-colors hover:text-[#2D2B3D]"
                style={{ color: '#8E8EA0' }}
              >
                {dmsOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Direct Messages
              </button>
              <button
                className="h-6 w-6 rounded-md flex items-center justify-center transition-all hover:bg-[#E0D6FF]"
                onClick={() => setDmDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" style={{ color: '#8E8EA0' }} />
              </button>
            </div>

            {dmsOpen && (
              <div className="space-y-0.5">
                {dmChannels
                  .filter((dm) => !hiddenDmIds.includes(dm.id))
                  .map((dm) => {
                    const isGroupDm = dm.name.startsWith('gdm-')
                    const otherName = isGroupDm
                      ? (dm.memberProfiles || []).map(m => m.display_name).join(', ') || 'Group DM'
                      : dm.otherUser?.display_name || 'Unknown'
                    const initial = isGroupDm
                      ? (dm.memberProfiles?.[0]?.display_name?.[0]?.toUpperCase() || 'G')
                      : (dm.otherUser?.display_name?.[0]?.toUpperCase() || '?')
                    const isOnline = isGroupDm
                      ? (dm.memberProfiles || []).some(m => m.is_online)
                      : (dm.otherUser?.is_online ?? false)
                    const isActive = currentChannelId === dm.id
                    const unreadCount = unreadCounts[dm.id] || 0
                    const dmHasActiveCall = !!channelActiveCalls[dm.id]

                    return (
                      <div key={dm.id} className="group relative">
                        <button
                          onClick={() => { setCurrentChannelId(dm.id); onNavigate?.() }}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-[6px] rounded-lg text-[14px] transition-all',
                            isActive
                              ? 'text-white font-semibold shadow-sm'
                              : unreadCount > 0
                                ? 'hover:bg-[#E0D6FF] font-semibold'
                                : 'hover:bg-[#E0D6FF]'
                          )}
                          style={{
                            background: isActive ? '#7C5CFC' : undefined,
                            color: isActive ? '#fff' : '#4A4860',
                          }}
                        >
                          {isGroupDm ? (
                            /* Stacked avatars for group DM */
                            <div className="relative shrink-0 w-5 h-5">
                              {dm.memberProfiles?.[0]?.avatar_url ? (
                                <img src={dm.memberProfiles[0].avatar_url} alt="" className="absolute top-0 left-0 h-3.5 w-3.5 rounded-sm object-cover border" style={{ borderColor: isActive ? '#7C5CFC' : '#F0EBFF' }} />
                              ) : (
                                <div
                                  className="absolute top-0 left-0 h-3.5 w-3.5 rounded-sm flex items-center justify-center text-[7px] font-bold border"
                                  style={{
                                    background: isActive ? 'rgba(255,255,255,0.25)' : '#E0D6FF',
                                    color: isActive ? '#fff' : '#7C5CFC',
                                    borderColor: isActive ? '#7C5CFC' : '#F0EBFF',
                                  }}
                                >
                                  {dm.memberProfiles?.[0]?.display_name?.[0]?.toUpperCase() || '?'}
                                </div>
                              )}
                              {dm.memberProfiles?.[1]?.avatar_url ? (
                                <img src={dm.memberProfiles[1].avatar_url} alt="" className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-sm object-cover border" style={{ borderColor: isActive ? '#7C5CFC' : '#F0EBFF' }} />
                              ) : (
                                <div
                                  className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-sm flex items-center justify-center text-[7px] font-bold border"
                                  style={{
                                    background: isActive ? 'rgba(255,255,255,0.35)' : '#D6CBFF',
                                    color: isActive ? '#fff' : '#7C5CFC',
                                    borderColor: isActive ? '#7C5CFC' : '#F0EBFF',
                                  }}
                                >
                                  {dm.memberProfiles?.[1]?.display_name?.[0]?.toUpperCase() || (dm.memberProfiles && dm.memberProfiles.length > 1 ? '+' : '?')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="relative shrink-0">
                              {dm.otherUser?.avatar_url ? (
                                <img
                                  src={dm.otherUser.avatar_url}
                                  alt={otherName}
                                  className="h-5 w-5 rounded-md object-cover"
                                />
                              ) : (
                                <div
                                  className="h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold"
                                  style={{ background: isActive ? 'rgba(255,255,255,0.25)' : '#E0D6FF', color: isActive ? '#fff' : '#7C5CFC' }}
                                >
                                  {initial}
                                </div>
                              )}
                              <Circle
                                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 ${
                                  isOnline ? 'fill-green-500 text-green-500' : 'fill-gray-300 text-gray-300'
                                }`}
                                strokeWidth={3}
                                stroke={isActive ? '#7C5CFC' : '#F0EBFF'}
                              />
                            </div>
                          )}
                          <span className="truncate flex-1 text-left">{otherName}</span>
                          {dmHasActiveCall && (
                            <Phone className="h-3 w-3 shrink-0 text-green-500" />
                          )}
                          {unreadCount > 0 && !isActive && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white min-w-[18px] text-center shrink-0"
                              style={{ background: '#7C5CFC' }}
                            >
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </button>
                        {/* Close / hide DM button (on hover) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            hideDm(dm.id)
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#DDD6F3]"
                          title="Close conversation"
                          style={{ color: '#8E8EA0' }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}

                {dmChannels.filter((dm) => !hiddenDmIds.includes(dm.id)).length === 0 && (
                  <button
                    onClick={() => setDmDialogOpen(true)}
                    className="w-full flex items-center gap-2 px-3 py-[6px] rounded-lg text-[14px] transition-all hover:bg-[#E0D6FF]"
                    style={{ color: '#8E8EA0' }}
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Start a conversation</span>
                  </button>
                )}
              </div>
            )}

            {/* Invite members button */}
            <button
              onClick={() => setInviteOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-[6px] mt-5 rounded-lg text-[14px] transition-all hover:bg-[#E0D6FF]"
              style={{ color: '#8E8EA0' }}
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              <span>Invite people</span>
            </button>
          </div>
        </ScrollArea>

        {/* User footer */}
        <div className="px-3 py-3" style={{ borderTop: '1px solid #DDD6F3' }}>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setProfileEditOpen(true)}
              className="flex items-center gap-2.5 min-w-0 hover:bg-[#E0D6FF] rounded-xl px-2 py-1.5 -mx-2 transition-all"
            >
              <div className="relative shrink-0">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.display_name}
                    className="h-9 w-9 rounded-xl object-cover"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold text-white" style={{ background: '#7C5CFC' }}>
                    {user?.display_name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <Circle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-green-500 text-green-500 stroke-[3]" stroke="#F0EBFF" />
              </div>
              <div className="min-w-0 text-left">
                <p className="text-[13px] font-semibold truncate" style={{ color: '#2D2B3D' }}>{user?.display_name}</p>
                {user?.status_emoji && (
                  <p className="text-[11px] truncate" style={{ color: '#8E8EA0' }}>
                    {user.status_emoji} {user.status_text || ''}
                  </p>
                )}
              </div>
            </button>
            <button
              className="h-8 w-8 rounded-lg flex items-center justify-center transition-all hover:bg-[#E0D6FF]"
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" style={{ color: '#8E8EA0' }} />
            </button>
          </div>
        </div>
      </div>

      <CreateChannelDialog open={createChannelOpen} onOpenChange={setCreateChannelOpen} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <DmDialog open={dmDialogOpen} onOpenChange={setDmDialogOpen} />
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <ProfileEditDialog open={profileEditOpen} onOpenChange={setProfileEditOpen} />
      <BrowseChannelsDialog open={browseOpen} onOpenChange={setBrowseOpen} />
      <WorkspaceSettingsDialog open={workspaceSettingsOpen} onOpenChange={setWorkspaceSettingsOpen} />
      <SavedItemsPanel open={savedItemsOpen} onClose={() => setSavedItemsOpen(false)} />
    </>
  )
}
