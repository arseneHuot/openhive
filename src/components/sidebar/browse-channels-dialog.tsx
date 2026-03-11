'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import { Hash, Search, Users, Loader2, Check } from 'lucide-react'
import type { Channel } from '@/types/database'

interface BrowseChannelsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ChannelWithInfo extends Channel {
  memberCount: number
  isMember: boolean
}

export function BrowseChannelsDialog({ open, onOpenChange }: BrowseChannelsDialogProps) {
  const { user, workspace, setCurrentChannelId, setPreviewChannel, addChannel } = useAppStore()
  const [allChannels, setAllChannels] = useState<ChannelWithInfo[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !workspace || !user) return
    loadChannels()
  }, [open, workspace, user])

  useEffect(() => {
    if (!open) {
      setSearch('')
    }
  }, [open])

  async function loadChannels() {
    const client = getSupabaseClient()
    if (!client || !workspace || !user) return

    setLoading(true)

    // Load all public non-DM channels
    const { data: chans } = await client
      .from('channels')
      .select('*')
      .eq('workspace_id', workspace.id)
      .eq('is_private', false)
      .eq('is_archived', false)
      .not('name', 'like', 'dm-%')
      .order('name')

    if (!chans) {
      setLoading(false)
      return
    }

    // Get user's memberships
    const { data: memberships } = await client
      .from('channel_members')
      .select('channel_id')
      .eq('profile_id', user.id)

    const memberChannelIds = new Set(memberships?.map((m) => m.channel_id) || [])

    // Get member counts for all channels
    const channelIds = chans.map((c) => c.id)
    const { data: memberCounts } = await client
      .from('channel_members')
      .select('channel_id')
      .in('channel_id', channelIds)

    const countMap = new Map<string, number>()
    memberCounts?.forEach((m) => {
      countMap.set(m.channel_id, (countMap.get(m.channel_id) || 0) + 1)
    })

    const withInfo: ChannelWithInfo[] = chans.map((c) => ({
      ...(c as Channel),
      memberCount: countMap.get(c.id) || 0,
      isMember: memberChannelIds.has(c.id),
    }))

    setAllChannels(withInfo)
    setLoading(false)
  }

  async function handleJoin(channel: ChannelWithInfo) {
    const client = getSupabaseClient()
    if (!client || !user) return

    setJoiningId(channel.id)
    try {
      await client.from('channel_members').insert({
        channel_id: channel.id,
        profile_id: user.id,
        role: 'member',
      })

      // Add to sidebar
      const { memberCount: _, isMember: __, ...rawChannel } = channel
      addChannel(rawChannel as Channel)

      // Update local state
      setAllChannels((prev) =>
        prev.map((c) =>
          c.id === channel.id ? { ...c, isMember: true, memberCount: c.memberCount + 1 } : c
        )
      )

      // Navigate to channel
      setCurrentChannelId(channel.id)
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to join channel:', err)
    }
    setJoiningId(null)
  }

  function handleGoToChannel(channelId: string) {
    setCurrentChannelId(channelId)
    onOpenChange(false)
  }

  const filtered = allChannels.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Browse channels</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-80 overflow-y-auto space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#7C5CFC' }} />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#8E8EA0' }}>
              {search ? 'No channels match your search' : 'No public channels available'}
            </p>
          ) : (
            filtered.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F5F2FF] transition-colors"
              >
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: '#EDE5FF' }}
                >
                  <Hash className="h-4 w-4" style={{ color: '#7C5CFC' }} />
                </div>

                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => {
                      if (channel.isMember) {
                        handleGoToChannel(channel.id)
                      } else {
                        // Preview channel without joining
                        const { memberCount: _, isMember: __, ...rawChannel } = channel
                        setPreviewChannel(rawChannel as Channel)
                        onOpenChange(false)
                      }
                    }}
                    className="text-[14px] font-semibold truncate block hover:underline cursor-pointer"
                    style={{ color: '#2D2B3D' }}
                  >
                    {channel.name}
                  </button>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] flex items-center gap-1"
                      style={{ color: '#8E8EA0' }}
                    >
                      <Users className="h-3 w-3" />
                      {channel.memberCount} {channel.memberCount === 1 ? 'member' : 'members'}
                    </span>
                    {channel.description && (
                      <>
                        <span style={{ color: '#C4C0D0' }}>&middot;</span>
                        <span className="text-[11px] truncate" style={{ color: '#8E8EA0' }}>
                          {channel.description}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {channel.isMember ? (
                  <span
                    className="text-[11px] font-medium px-2 py-1 rounded-lg shrink-0 flex items-center gap-1"
                    style={{ background: '#EDE5FF', color: '#7C5CFC' }}
                  >
                    <Check className="h-3 w-3" />
                    Joined
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleJoin(channel)}
                    disabled={joiningId === channel.id}
                    className="shrink-0 text-[12px] h-7"
                    style={{ background: '#7C5CFC', color: '#fff' }}
                  >
                    {joiningId === channel.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      'Join'
                    )}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
