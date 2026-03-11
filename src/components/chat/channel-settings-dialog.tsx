'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Hash, Lock, UserPlus, LogOut, Trash2, Circle, X, Crown, Bell, BellOff, Pencil, Check, AlertTriangle } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import type { Channel, Profile } from '@/types/database'

interface ChannelSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: Channel
}

interface MemberWithRole {
  profile: Profile
  role: string
}

export function ChannelSettingsDialog({ open, onOpenChange, channel }: ChannelSettingsDialogProps) {
  const { user, workspace, removeChannel, updateChannel, setCurrentChannelId, channels, mutedChannelIds, muteChannel, unmuteChannel } = useAppStore()
  const [members, setMembers] = useState<MemberWithRole[]>([])
  const [allWorkspaceMembers, setAllWorkspaceMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [memberSearch, setMemberSearch] = useState('')
  const [isMember, setIsMember] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [joining, setJoining] = useState(false)
  const [adding, setAdding] = useState(false)

  // Rename state
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Ownership transfer state (shown when creator tries to leave)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferTarget, setTransferTarget] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)

  useEffect(() => {
    if (!open) {
      setIsRenaming(false)
      setShowDeleteConfirm(false)
      setShowTransfer(false)
      setTransferTarget(null)
      setRenameError(null)
      return
    }
    loadMembers()
    loadWorkspaceMembers()
  }, [open, channel.id])

  async function loadMembers() {
    const client = getSupabaseClient()
    if (!client) return

    setLoading(true)
    const { data } = await client
      .from('channel_members')
      .select('profile_id, role, profile:profiles(*)')
      .eq('channel_id', channel.id)

    if (data) {
      const mems = data.map((d) => ({
        profile: d.profile as unknown as Profile,
        role: d.role,
      })).filter((m) => m.profile)

      setMembers(mems)
      setIsMember(mems.some((m) => m.profile.id === user?.id))
    }
    setLoading(false)
  }

  async function loadWorkspaceMembers() {
    const client = getSupabaseClient()
    if (!client || !workspace) return

    const { data } = await client
      .from('workspace_members')
      .select('profile:profiles(*)')
      .eq('workspace_id', workspace.id)

    if (data) {
      const profiles = data
        .map((d: Record<string, unknown>) => d.profile as Profile)
        .filter(Boolean)
      setAllWorkspaceMembers(profiles)
    }
  }

  const nonMembers = allWorkspaceMembers.filter(
    (p) =>
      !members.some((m) => m.profile.id === p.id) &&
      (p.display_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
        p.email?.toLowerCase().includes(memberSearch.toLowerCase()))
  )

  function formatChannelName(value: string) {
    return value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '')
  }

  async function handleRename() {
    const client = getSupabaseClient()
    if (!client || !newName.trim()) return

    const formatted = formatChannelName(newName)
    if (!formatted || formatted === channel.name) {
      setIsRenaming(false)
      return
    }

    setRenaming(true)
    setRenameError(null)

    try {
      const { error } = await client
        .from('channels')
        .update({ name: formatted })
        .eq('id', channel.id)

      if (error) throw error

      updateChannel(channel.id, { name: formatted })
      setIsRenaming(false)
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Failed to rename')
    }
    setRenaming(false)
  }

  async function handleDeleteChannel() {
    const client = getSupabaseClient()
    if (!client) return

    setDeleting(true)
    try {
      // Delete all channel members first
      await client
        .from('channel_members')
        .delete()
        .eq('channel_id', channel.id)

      // Archive channel (soft delete - set is_archived)
      await client
        .from('channels')
        .update({ is_archived: true })
        .eq('id', channel.id)

      removeChannel(channel.id)

      // Switch to first available channel
      const remaining = channels.filter((c) => c.id !== channel.id && !c.name.startsWith('dm-'))
      if (remaining.length > 0) {
        setCurrentChannelId(remaining[0].id)
      }

      onOpenChange(false)
    } catch (err) {
      console.error('Failed to delete channel:', err)
    }
    setDeleting(false)
  }

  async function handleJoinChannel() {
    const client = getSupabaseClient()
    if (!client || !user) return

    setJoining(true)
    try {
      await client.from('channel_members').insert({
        channel_id: channel.id,
        profile_id: user.id,
        role: 'member',
      })
      setIsMember(true)
      await loadMembers()
    } catch (err) {
      console.error('Failed to join:', err)
    }
    setJoining(false)
  }

  async function handleLeaveChannel() {
    // If creator, show ownership transfer dialog
    if (isCreator) {
      const otherMembers = members.filter((m) => m.profile.id !== user?.id)
      if (otherMembers.length > 0) {
        setShowTransfer(true)
        return
      }
      // If no other members, just delete the channel
      await handleDeleteChannel()
      return
    }

    const client = getSupabaseClient()
    if (!client || !user) return

    setLeaving(true)
    try {
      await client
        .from('channel_members')
        .delete()
        .eq('channel_id', channel.id)
        .eq('profile_id', user.id)

      removeChannel(channel.id)

      const remaining = channels.filter((c) => c.id !== channel.id && !c.name.startsWith('dm-'))
      if (remaining.length > 0) {
        setCurrentChannelId(remaining[0].id)
      }

      onOpenChange(false)
    } catch (err) {
      console.error('Failed to leave:', err)
    }
    setLeaving(false)
  }

  async function handleTransferAndLeave() {
    if (!transferTarget) return
    const client = getSupabaseClient()
    if (!client || !user) return

    setTransferring(true)
    try {
      // Transfer ownership: update created_by and set new owner as admin
      await client
        .from('channels')
        .update({ created_by: transferTarget })
        .eq('id', channel.id)

      await client
        .from('channel_members')
        .update({ role: 'admin' })
        .eq('channel_id', channel.id)
        .eq('profile_id', transferTarget)

      // Now leave
      await client
        .from('channel_members')
        .delete()
        .eq('channel_id', channel.id)
        .eq('profile_id', user.id)

      removeChannel(channel.id)

      const remaining = channels.filter((c) => c.id !== channel.id && !c.name.startsWith('dm-'))
      if (remaining.length > 0) {
        setCurrentChannelId(remaining[0].id)
      }

      onOpenChange(false)
    } catch (err) {
      console.error('Failed to transfer ownership:', err)
    }
    setTransferring(false)
  }

  async function handleAddMember(profile: Profile) {
    const client = getSupabaseClient()
    if (!client) return

    setAdding(true)
    try {
      await client.from('channel_members').insert({
        channel_id: channel.id,
        profile_id: profile.id,
        role: 'member',
      })
      setMemberSearch('')
      await loadMembers()
    } catch (err) {
      console.error('Failed to add member:', err)
    }
    setAdding(false)
  }

  async function handleRemoveMember(profileId: string) {
    const client = getSupabaseClient()
    if (!client) return

    try {
      await client
        .from('channel_members')
        .delete()
        .eq('channel_id', channel.id)
        .eq('profile_id', profileId)

      await loadMembers()
    } catch (err) {
      console.error('Failed to remove member:', err)
    }
  }

  const currentUserRole = members.find((m) => m.profile.id === user?.id)?.role
  const isAdmin = currentUserRole === 'admin'
  const isCreator = channel.created_by === user?.id
  const isMuted = mutedChannelIds.includes(channel.id)
  const otherMembers = members.filter((m) => m.profile.id !== user?.id)

  // Ownership transfer view
  if (showTransfer) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" style={{ color: '#F59E0B' }} />
              Transfer ownership
            </DialogTitle>
          </DialogHeader>

          <p className="text-[13px]" style={{ color: '#4A4860' }}>
            You are the owner of <strong>#{channel.name}</strong>. Before leaving, please select a new owner for this channel.
          </p>

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {otherMembers.map((m) => (
              <button
                key={m.profile.id}
                onClick={() => setTransferTarget(m.profile.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left ${
                  transferTarget === m.profile.id ? 'bg-[#EDE5FF]' : 'hover:bg-[#F5F2FF]'
                }`}
                style={{
                  border: transferTarget === m.profile.id ? '1px solid #7C5CFC' : '1px solid transparent',
                }}
              >
                <div className="relative shrink-0">
                  {m.profile.avatar_url ? (
                    <img src={m.profile.avatar_url} alt="" className="h-7 w-7 rounded-lg object-cover" />
                  ) : (
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white" style={{ background: '#7C5CFC' }}>
                      {m.profile.display_name[0]?.toUpperCase()}
                    </div>
                  )}
                  <Circle
                    className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 ${
                      m.profile.is_online ? 'fill-green-500 text-green-500' : 'fill-gray-300 text-gray-300'
                    }`}
                    strokeWidth={3}
                    stroke="white"
                  />
                </div>
                <span className="text-[13px] font-medium" style={{ color: '#2D2B3D' }}>
                  {m.profile.display_name}
                </span>
                {m.role === 'admin' && (
                  <Crown className="h-3 w-3 ml-auto" style={{ color: '#F59E0B' }} />
                )}
                {transferTarget === m.profile.id && (
                  <Check className="h-4 w-4 ml-auto" style={{ color: '#7C5CFC' }} />
                )}
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowTransfer(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTransferAndLeave}
              disabled={!transferTarget || transferring}
              style={{ background: '#7C5CFC', color: '#fff' }}
            >
              {transferring ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Transfer & Leave
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Delete confirmation view
  if (showDeleteConfirm) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#E55B5B]">
              <Trash2 className="h-5 w-5" />
              Delete channel
            </DialogTitle>
          </DialogHeader>

          <p className="text-[13px]" style={{ color: '#4A4860' }}>
            Are you sure you want to delete <strong>#{channel.name}</strong>? This will archive the channel and remove all members. This action cannot be undone.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteChannel}
              disabled={deleting}
              className="bg-[#E55B5B] hover:bg-[#D04444] text-white"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete Channel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {channel.is_private ? (
              <Lock className="h-5 w-5" style={{ color: '#7C5CFC' }} />
            ) : (
              <Hash className="h-5 w-5" style={{ color: '#7C5CFC' }} />
            )}
            {isRenaming ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-[16px] font-bold"
                  placeholder="Channel name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename()
                    if (e.key === 'Escape') setIsRenaming(false)
                  }}
                />
                <Button size="sm" onClick={handleRename} disabled={renaming} className="h-8 px-2" style={{ background: '#7C5CFC', color: '#fff' }}>
                  {renaming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsRenaming(false)} className="h-8 px-2">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <>
                <span>{channel.name}</span>
                {isCreator && channel.name !== 'general' && (
                  <button
                    onClick={() => { setNewName(channel.name); setIsRenaming(true) }}
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-[#F5F2FF] transition-colors"
                    title="Rename channel"
                  >
                    <Pencil className="h-3 w-3" style={{ color: '#8E8EA0' }} />
                  </button>
                )}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {renameError && (
          <div className="p-2 rounded-lg text-[12px]" style={{ background: '#FEE2E2', color: '#E55B5B' }}>
            {renameError}
          </div>
        )}

        {channel.description && (
          <p className="text-[13px]" style={{ color: '#8E8EA0' }}>{channel.description}</p>
        )}

        <div className="space-y-5 pt-2">
          {/* Mute / Unmute */}
          {isMember && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => isMuted ? unmuteChannel(channel.id) : muteChannel(channel.id)}
                className="flex-1"
              >
                {isMuted ? (
                  <>
                    <Bell className="h-4 w-4 mr-1" />
                    Unmute Channel
                  </>
                ) : (
                  <>
                    <BellOff className="h-4 w-4 mr-1" />
                    Mute Channel
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Join / Leave */}
          <div className="flex gap-2">
            {!isMember && !channel.is_private && (
              <Button
                onClick={handleJoinChannel}
                disabled={joining}
                className="flex-1"
                style={{ background: '#7C5CFC', color: '#fff' }}
              >
                {joining ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
                Join Channel
              </Button>
            )}
            {isMember && channel.name !== 'general' && (
              <Button
                variant="outline"
                onClick={handleLeaveChannel}
                disabled={leaving}
                className="flex-1 text-[#E55B5B] hover:text-[#E55B5B] hover:bg-red-50"
              >
                {leaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <LogOut className="h-4 w-4 mr-1" />}
                Leave Channel
              </Button>
            )}
          </div>

          {/* Members */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: '#8E8EA0' }}>
                Members ({members.length})
              </Label>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#7C5CFC' }} />
              </div>
            ) : (
              <div className="space-y-1">
                {members.map((m) => (
                  <div key={m.profile.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg group hover:bg-[#F5F2FF]">
                    <div className="relative shrink-0">
                      {m.profile.avatar_url ? (
                        <img src={m.profile.avatar_url} alt="" className="h-7 w-7 rounded-lg object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white" style={{ background: '#7C5CFC' }}>
                          {m.profile.display_name[0]?.toUpperCase()}
                        </div>
                      )}
                      <Circle
                        className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 ${
                          m.profile.is_online ? 'fill-green-500 text-green-500' : 'fill-gray-300 text-gray-300'
                        }`}
                        strokeWidth={3}
                        stroke="white"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium truncate" style={{ color: '#2D2B3D' }}>
                          {m.profile.display_name}
                        </span>
                        {m.profile.id === user?.id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#F5F2FF', color: '#8E8EA0' }}>you</span>
                        )}
                        {m.role === 'admin' && (
                          <Crown className="h-3 w-3" style={{ color: '#F59E0B' }} />
                        )}
                      </div>
                    </div>

                    {/* Remove button (only for admins/creator, can't remove yourself) */}
                    {(isAdmin || isCreator) && m.profile.id !== user?.id && (
                      <button
                        onClick={() => handleRemoveMember(m.profile.id)}
                        className="h-6 w-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                        title="Remove from channel"
                      >
                        <X className="h-3 w-3" style={{ color: '#E55B5B' }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add members (if admin/creator) */}
          {isMember && (isAdmin || isCreator) && (
            <div className="space-y-2 pt-2" style={{ borderTop: '1px solid #E5E1EE' }}>
              <Label className="text-[13px]">Add members</Label>
              <Input
                placeholder="Search workspace members..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
              />

              {memberSearch && nonMembers.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-0.5 rounded-lg border border-[#E5E1EE] p-1">
                  {nonMembers.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAddMember(p)}
                      disabled={adding}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#F5F2FF] transition-colors text-left text-[13px]"
                    >
                      <div className="relative shrink-0">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="h-6 w-6 rounded-md object-cover" />
                        ) : (
                          <div className="h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white" style={{ background: '#7C5CFC' }}>
                            {p.display_name[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span style={{ color: '#2D2B3D' }}>{p.display_name}</span>
                      {p.email && <span className="text-[11px] ml-auto" style={{ color: '#8E8EA0' }}>{p.email}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Delete channel (creator only) */}
          {isCreator && channel.name !== 'general' && (
            <div className="pt-2" style={{ borderTop: '1px solid #E5E1EE' }}>
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full text-[#E55B5B] hover:text-[#E55B5B] hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Channel
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
