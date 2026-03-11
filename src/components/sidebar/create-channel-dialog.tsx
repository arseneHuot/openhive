'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Hash, Lock, X, Circle } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import type { Channel, Profile } from '@/types/database'

interface CreateChannelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateChannelDialog({ open, onOpenChange }: CreateChannelDialogProps) {
  const { workspace, user, addChannel, setCurrentChannelId } = useAppStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Member invite
  const [allMembers, setAllMembers] = useState<Profile[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([])

  useEffect(() => {
    if (!open || !workspace) return
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
          setAllMembers(profiles)
        }
      })
  }, [open, workspace, user])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setName('')
      setDescription('')
      setIsPrivate(false)
      setSelectedMembers([])
      setMemberSearch('')
      setError(null)
    }
  }, [open])

  function formatChannelName(value: string) {
    return value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '')
  }

  const filteredMembers = allMembers.filter(
    (m) =>
      !selectedMembers.some((s) => s.id === m.id) &&
      (m.display_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
        m.email?.toLowerCase().includes(memberSearch.toLowerCase()))
  )

  function addMember(member: Profile) {
    setSelectedMembers((prev) => [...prev, member])
    setMemberSearch('')
  }

  function removeMember(memberId: string) {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== memberId))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const client = getSupabaseClient()
    if (!client || !workspace || !user) return

    const channelName = formatChannelName(name)
    if (!channelName) return

    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await client.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      // Create channel
      const { data: channel, error: chError } = await client
        .from('channels')
        .insert({
          workspace_id: workspace.id,
          name: channelName,
          description: description.trim() || null,
          is_private: isPrivate,
          created_by: session.user.id,
        })
        .select()
        .single()

      if (chError) throw chError

      // Add creator as channel admin
      await client.from('channel_members').insert({
        channel_id: channel.id,
        profile_id: session.user.id,
        role: 'admin',
      })

      // Add selected members
      if (selectedMembers.length > 0) {
        await client.from('channel_members').insert(
          selectedMembers.map((m) => ({
            channel_id: channel.id,
            profile_id: m.id,
            role: 'member',
          }))
        )
      }

      addChannel(channel as Channel)
      setCurrentChannelId(channel.id)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a channel</DialogTitle>
          <DialogDescription>
            Channels are where your team communicates. They&apos;re best organized around a topic.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          {/* Channel name */}
          <div className="space-y-2">
            <Label htmlFor="ch-name">Name</Label>
            <div className="relative">
              {isPrivate ? (
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              ) : (
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
              <Input
                id="ch-name"
                placeholder="e.g. marketing"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-9"
                required
              />
            </div>
            {name && (
              <p className="text-xs text-muted-foreground">
                Channel will be created as <span className="font-mono">{isPrivate ? '🔒' : '#'}{formatChannelName(name)}</span>
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="ch-desc">Description <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="ch-desc"
              placeholder="What is this channel about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Visibility toggle */}
          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] transition-all ${
                  !isPrivate ? 'border-[#7C5CFC] bg-[#EDE5FF]' : 'border-[#E5E1EE] hover:border-[#DDD6F3]'
                }`}
                style={{ color: !isPrivate ? '#7C5CFC' : '#4A4860' }}
              >
                <Hash className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">Public</div>
                  <div className="text-[11px] opacity-70">Anyone can join</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] transition-all ${
                  isPrivate ? 'border-[#7C5CFC] bg-[#EDE5FF]' : 'border-[#E5E1EE] hover:border-[#DDD6F3]'
                }`}
                style={{ color: isPrivate ? '#7C5CFC' : '#4A4860' }}
              >
                <Lock className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">Private</div>
                  <div className="text-[11px] opacity-70">Invite only</div>
                </div>
              </button>
            </div>
          </div>

          {/* Add members */}
          <div className="space-y-2">
            <Label>Add members <span className="text-muted-foreground">(optional)</span></Label>

            {/* Selected members chips */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedMembers.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-medium"
                    style={{ background: '#EDE5FF', color: '#7C5CFC' }}
                  >
                    {m.display_name}
                    <button
                      type="button"
                      onClick={() => removeMember(m.id)}
                      className="hover:text-[#E55B5B] transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <Input
              placeholder="Search members to add..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />

            {/* Member suggestions */}
            {memberSearch && filteredMembers.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-0.5 rounded-lg border border-[#E5E1EE] p-1">
                {filteredMembers.slice(0, 6).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addMember(m)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#F5F2FF] transition-colors text-left text-[13px]"
                  >
                    <div className="relative shrink-0">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="h-6 w-6 rounded-md object-cover" />
                      ) : (
                        <div className="h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white" style={{ background: '#7C5CFC' }}>
                          {m.display_name[0]?.toUpperCase()}
                        </div>
                      )}
                      <Circle
                        className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 ${
                          m.is_online ? 'fill-green-500 text-green-500' : 'fill-gray-300 text-gray-300'
                        }`}
                        strokeWidth={3}
                        stroke="white"
                      />
                    </div>
                    <span style={{ color: '#2D2B3D' }}>{m.display_name}</span>
                    {m.email && <span className="text-[11px] ml-auto" style={{ color: '#8E8EA0' }}>{m.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !formatChannelName(name)}
              style={{ background: '#7C5CFC', color: '#fff' }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Channel'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
