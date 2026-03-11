'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import { Circle, Search, X, Users, Check } from 'lucide-react'
import type { Profile, Channel } from '@/types/database'

interface DmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DmDialog({ open, onOpenChange }: DmDialogProps) {
  const { user, workspace, setCurrentChannelId, addDmChannel, unhideDm, dmChannels, hiddenDmIds } = useAppStore()
  const [members, setMembers] = useState<Profile[]>([])
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    setSelectedMembers([])
    setSearch('')
    const client = getSupabaseClient()
    if (!client) return

    client
      .from('workspace_members')
      .select('profile:profiles(*)')
      .eq('workspace_id', workspace.id)
      .then(({ data }) => {
        if (data) {
          const profiles = data
            .map((d: Record<string, unknown>) => d.profile as Profile)
            .filter((p) => p && p.id !== user?.id)
          setMembers(profiles)
        }
      })
  }, [open, workspace, user])

  const filtered = members.filter((m) =>
    (m.display_name.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase())) &&
    !selectedMembers.some(s => s.id === m.id)
  )

  function toggleMember(member: Profile) {
    setSelectedMembers(prev => {
      const exists = prev.some(m => m.id === member.id)
      if (exists) return prev.filter(m => m.id !== member.id)
      return [...prev, member]
    })
    setSearch('')
  }

  async function startDm(otherUser: Profile) {
    const client = getSupabaseClient()
    if (!client || !user || !workspace) return

    setLoading(true)

    try {
      const ids = [user.id, otherUser.id].sort()
      const dmName = `dm-${ids[0].slice(0, 8)}-${ids[1].slice(0, 8)}`

      const { data: existing } = await client
        .from('channels')
        .select('*')
        .eq('workspace_id', workspace.id)
        .eq('name', dmName)
        .limit(1)

      let channelId: string

      if (existing && existing.length > 0) {
        channelId = existing[0].id
        if (hiddenDmIds.includes(channelId)) {
          unhideDm(channelId)
        }
      } else {
        const id = crypto.randomUUID()
        const { error } = await client.from('channels').insert({
          id,
          workspace_id: workspace.id,
          name: dmName,
          description: `Direct message between ${user.display_name} and ${otherUser.display_name}`,
          is_private: true,
          created_by: user.id,
        })
        if (error) throw error

        const { error: memberError } = await client.from('channel_members').insert([
          { channel_id: id, profile_id: user.id, role: 'admin' },
          { channel_id: id, profile_id: otherUser.id, role: 'admin' },
        ])
        if (memberError) throw memberError
        channelId = id
      }

      const { data: channelData } = await client
        .from('channels')
        .select('*')
        .eq('id', channelId)
        .single()

      if (channelData) {
        addDmChannel({ ...channelData, otherUser })
      }

      setCurrentChannelId(channelId)
      onOpenChange(false)
      setSearch('')
    } catch (err) {
      console.error('Failed to start DM:', err)
    } finally {
      setLoading(false)
    }
  }

  async function startGroupDm() {
    const client = getSupabaseClient()
    if (!client || !user || !workspace || selectedMembers.length < 2) return

    setLoading(true)

    try {
      const id = crypto.randomUUID()
      const gdmName = `gdm-${id.slice(0, 12)}`
      const memberNames = selectedMembers.map(m => m.display_name).join(', ')

      const { error } = await client.from('channels').insert({
        id,
        workspace_id: workspace.id,
        name: gdmName,
        description: `Group DM: ${user.display_name}, ${memberNames}`,
        is_private: true,
        created_by: user.id,
      })
      if (error) throw error

      // Add all members including current user
      const memberInserts = [
        { channel_id: id, profile_id: user.id, role: 'admin' },
        ...selectedMembers.map(m => ({
          channel_id: id,
          profile_id: m.id,
          role: 'member' as string,
        })),
      ]
      await client.from('channel_members').insert(memberInserts)

      const { data: channelData } = await client
        .from('channels')
        .select('*')
        .eq('id', id)
        .single()

      if (channelData) {
        // For group DMs, otherUser is not just one person - we'll handle display in sidebar
        addDmChannel({ ...channelData, memberProfiles: selectedMembers })
      }

      setCurrentChannelId(id)
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to create group DM:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleMemberClick(member: Profile) {
    if (selectedMembers.length === 0) {
      // If no one selected yet, start DM directly on single click
      await startDm(member)
    } else {
      // If already selecting, toggle this member
      toggleMember(member)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Direct Messages</DialogTitle>
        </DialogHeader>

        {/* Selected members chips */}
        {selectedMembers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-1">
            {selectedMembers.map(member => (
              <div
                key={member.id}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                style={{ background: '#EDE5FF', color: '#7C5CFC' }}
              >
                {member.display_name}
                <button onClick={() => toggleMember(member)} className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={selectedMembers.length > 0 ? "Add more people..." : "Search people..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {search ? 'No members found' : 'No other members in this workspace'}
            </p>
          ) : (
            filtered.map((member) => {
              const isSelected = selectedMembers.some(m => m.id === member.id)
              return (
                <button
                  key={member.id}
                  onClick={() => handleMemberClick(member)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    toggleMember(member)
                  }}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left"
                >
                  <div className="relative">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt={member.display_name} className="h-8 w-8 rounded-lg object-cover" />
                      ) : (
                        member.display_name[0]?.toUpperCase() || '?'
                      )}
                    </div>
                    <Circle
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 ${
                        member.is_online
                          ? 'fill-green-500 text-green-500'
                          : 'fill-muted-foreground/30 text-muted-foreground/30'
                      }`}
                      strokeWidth={3}
                      stroke="hsl(var(--background))"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{member.display_name}</p>
                    {member.email && (
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    )}
                  </div>
                  {/* Multi-select checkbox icon */}
                  <div
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleMember(member)
                    }}
                    className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#7C5CFC] border-[#7C5CFC] text-white'
                        : 'border-[#DDD6F3] hover:border-[#7C5CFC]'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Create group button */}
        {selectedMembers.length >= 2 && (
          <Button
            onClick={startGroupDm}
            disabled={loading}
            className="w-full"
            style={{ background: '#7C5CFC', color: '#fff' }}
          >
            <Users className="h-4 w-4 mr-2" />
            Create Group DM ({selectedMembers.length + 1} people)
          </Button>
        )}
        {selectedMembers.length === 1 && (
          <Button
            onClick={() => startDm(selectedMembers[0])}
            disabled={loading}
            className="w-full"
            style={{ background: '#7C5CFC', color: '#fff' }}
          >
            Message {selectedMembers[0].display_name}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
