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
import {
  Loader2,
  Settings,
  Circle,
  Crown,
  Shield,
  ShieldCheck,
  UserMinus,
  Check,
  X,
  UserX,
  Video,
  ExternalLink,
  Webhook,
  Bot,
} from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import { WebhookSettings } from './webhook-settings'
import { BotSettings } from './bot-settings'
import type { Profile, WorkspaceSettings } from '@/types/database'

interface WorkspaceSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface MemberWithRole {
  profile: Profile
  role: 'owner' | 'admin' | 'member'
}

interface LiveKitConfig {
  livekit_url: string
  livekit_api_key: string
  livekit_api_secret: string
  calls_enabled: boolean
}

export function WorkspaceSettingsDialog({ open, onOpenChange }: WorkspaceSettingsDialogProps) {
  const { user, workspace, workspaceRole, setWorkspace } = useAppStore()
  const [members, setMembers] = useState<MemberWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Tabs
  const [activeTab, setActiveTab] = useState<'general' | 'webhooks' | 'bots'>('general')

  // Confirm remove member
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  // LiveKit config
  const [livekitConfig, setLivekitConfig] = useState<LiveKitConfig>({
    livekit_url: '',
    livekit_api_key: '',
    livekit_api_secret: '',
    calls_enabled: false,
  })
  const [savingLivekit, setSavingLivekit] = useState(false)
  const [livekitSaved, setLivekitSaved] = useState(false)

  const isAdmin = workspaceRole === 'admin' || workspaceRole === 'owner'
  const isOwner = workspaceRole === 'owner'

  useEffect(() => {
    if (!open) {
      setSearch('')
      setConfirmRemoveId(null)
      setActiveTab('general')
      return
    }
    loadMembers()
    loadLivekitConfig()
  }, [open])

  async function loadMembers() {
    const client = getSupabaseClient()
    if (!client || !workspace) return

    setLoading(true)
    const { data } = await client
      .from('workspace_members')
      .select('profile_id, role, profile:profiles(*)')
      .eq('workspace_id', workspace.id)

    if (data) {
      const mems = data
        .map((d) => ({
          profile: d.profile as unknown as Profile,
          role: d.role as 'owner' | 'admin' | 'member',
        }))
        .filter((m) => m.profile)
        .sort((a, b) => {
          const order = { owner: 0, admin: 1, member: 2 }
          return order[a.role] - order[b.role] || a.profile.display_name.localeCompare(b.profile.display_name)
        })

      setMembers(mems)
    }
    setLoading(false)
  }

  async function loadLivekitConfig() {
    const client = getSupabaseClient()
    if (!client || !workspace) return

    const { data } = await client
      .from('workspace_settings')
      .select('*')
      .eq('workspace_id', workspace.id)
      .single()

    if (data) {
      setLivekitConfig({
        livekit_url: data.livekit_url || '',
        livekit_api_key: data.livekit_api_key || '',
        livekit_api_secret: data.livekit_api_secret || '',
        calls_enabled: data.calls_enabled || false,
      })
    }
  }

  async function saveLivekitConfig() {
    const client = getSupabaseClient()
    if (!client || !workspace) return

    setSavingLivekit(true)
    setLivekitSaved(false)

    try {
      // Upsert workspace_settings
      const { error } = await client
        .from('workspace_settings')
        .upsert({
          workspace_id: workspace.id,
          livekit_url: livekitConfig.livekit_url || null,
          livekit_api_key: livekitConfig.livekit_api_key || null,
          livekit_api_secret: livekitConfig.livekit_api_secret || null,
          calls_enabled: livekitConfig.calls_enabled,
        })

      if (error) throw error
      setLivekitSaved(true)
      setTimeout(() => setLivekitSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save LiveKit config:', err)
    }
    setSavingLivekit(false)
  }

  async function handleChangeRole(profileId: string, newRole: 'admin' | 'member') {
    const client = getSupabaseClient()
    if (!client || !workspace) return

    try {
      await client
        .from('workspace_members')
        .update({ role: newRole })
        .eq('workspace_id', workspace.id)
        .eq('profile_id', profileId)

      setMembers((prev) =>
        prev.map((m) =>
          m.profile.id === profileId ? { ...m, role: newRole } : m
        )
      )
    } catch (err) {
      console.error('Failed to change role:', err)
    }
  }

  async function handleRemoveMember(profileId: string) {
    const client = getSupabaseClient()
    if (!client || !workspace) return

    setRemoving(true)
    try {
      // Remove from all channels in this workspace
      const { data: channels } = await client
        .from('channels')
        .select('id')
        .eq('workspace_id', workspace.id)

      if (channels) {
        for (const ch of channels) {
          await client
            .from('channel_members')
            .delete()
            .eq('channel_id', ch.id)
            .eq('profile_id', profileId)
        }
      }

      // Remove from workspace
      await client
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspace.id)
        .eq('profile_id', profileId)

      setMembers((prev) => prev.filter((m) => m.profile.id !== profileId))
      setConfirmRemoveId(null)
    } catch (err) {
      console.error('Failed to remove member:', err)
    }
    setRemoving(false)
  }

  const filteredMembers = members.filter((m) =>
    m.profile.display_name.toLowerCase().includes(search.toLowerCase()) ||
    m.profile.email?.toLowerCase().includes(search.toLowerCase())
  )

  function roleLabel(role: string) {
    switch (role) {
      case 'owner': return 'Owner'
      case 'admin': return 'Admin'
      default: return 'Member'
    }
  }

  function roleIcon(role: string) {
    switch (role) {
      case 'owner':
        return <Crown className="h-3 w-3" style={{ color: '#F59E0B' }} />
      case 'admin':
        return <ShieldCheck className="h-3 w-3" style={{ color: '#7C5CFC' }} />
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" style={{ color: '#7C5CFC' }} />
            Workspace Settings
          </DialogTitle>
        </DialogHeader>

        {/* Tab Navigation */}
        {isAdmin && (
          <div className="flex gap-1 border-b pt-1" style={{ borderColor: '#E5E1EE' }}>
            {[
              { key: 'general' as const, label: 'General', icon: Settings },
              { key: 'webhooks' as const, label: 'Webhooks', icon: Webhook },
              { key: 'bots' as const, label: 'Bots', icon: Bot },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px"
                style={{
                  borderColor: activeTab === tab.key ? '#7C5CFC' : 'transparent',
                  color: activeTab === tab.key ? '#7C5CFC' : '#8E8EA0',
                }}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'webhooks' && isAdmin ? (
          <div className="pt-2">
            <WebhookSettings />
          </div>
        ) : activeTab === 'bots' && isAdmin ? (
          <div className="pt-2">
            <BotSettings />
          </div>
        ) : (
        <div className="space-y-5 pt-1">
          {/* Workspace name */}
          <div className="space-y-2">
            <Label className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: '#8E8EA0' }}>
              Workspace name
            </Label>
            <div className="flex items-center gap-2.5 flex-1 px-3 py-2 rounded-lg" style={{ background: '#F5F2FF' }}>
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ background: '#7C5CFC' }}
              >
                {(workspace?.name || 'O')[0]?.toUpperCase()}
              </div>
              <span className="text-[15px] font-semibold" style={{ color: '#2D2B3D' }}>
                {workspace?.name}
              </span>
            </div>
          </div>

          {/* Members */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: '#8E8EA0' }}>
                Members ({members.length})
              </Label>
            </div>

            {members.length > 5 && (
              <Input
                placeholder="Search members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#7C5CFC' }} />
              </div>
            ) : (
              <div className="space-y-1">
                {filteredMembers.map((m) => {
                  const isSelf = m.profile.id === user?.id
                  const canManage = isAdmin && !isSelf && m.role !== 'owner'
                  const canPromote = isOwner && !isSelf && m.role !== 'owner'

                  return (
                    <div
                      key={m.profile.id}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-lg group hover:bg-[#F5F2FF] transition-colors"
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        {m.profile.avatar_url ? (
                          <img
                            src={m.profile.avatar_url}
                            alt=""
                            className="h-8 w-8 rounded-lg object-cover"
                          />
                        ) : (
                          <div
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-[12px] font-bold text-white"
                            style={{ background: '#7C5CFC' }}
                          >
                            {m.profile.display_name[0]?.toUpperCase()}
                          </div>
                        )}
                        <Circle
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 ${
                            m.profile.is_online
                              ? 'fill-green-500 text-green-500'
                              : 'fill-gray-300 text-gray-300'
                          }`}
                          strokeWidth={3}
                          stroke="white"
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[13px] font-medium truncate"
                            style={{ color: '#2D2B3D' }}
                          >
                            {m.profile.display_name}
                          </span>
                          {isSelf && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: '#F5F2FF', color: '#8E8EA0' }}
                            >
                              you
                            </span>
                          )}
                          {roleIcon(m.role)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px]" style={{ color: '#8E8EA0' }}>
                            {roleLabel(m.role)}
                          </span>
                          {m.profile.email && (
                            <>
                              <span style={{ color: '#C4C0D0' }}>&middot;</span>
                              <span className="text-[11px] truncate" style={{ color: '#8E8EA0' }}>
                                {m.profile.email}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      {canManage && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Promote / Demote */}
                          {canPromote && (
                            <button
                              onClick={() =>
                                handleChangeRole(
                                  m.profile.id,
                                  m.role === 'admin' ? 'member' : 'admin'
                                )
                              }
                              className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-medium transition-colors hover:bg-[#EDE5FF]"
                              style={{ color: '#7C5CFC' }}
                              title={
                                m.role === 'admin'
                                  ? 'Demote to member'
                                  : 'Promote to admin'
                              }
                            >
                              {m.role === 'admin' ? (
                                <>
                                  <Shield className="h-3 w-3" />
                                  Demote
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="h-3 w-3" />
                                  Admin
                                </>
                              )}
                            </button>
                          )}

                          {/* Remove */}
                          {confirmRemoveId === m.profile.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleRemoveMember(m.profile.id)}
                                disabled={removing}
                                className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-medium transition-colors bg-[#FEE2E2] hover:bg-[#FECACA]"
                                style={{ color: '#E55B5B' }}
                              >
                                {removing ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Confirm'
                                )}
                              </button>
                              <button
                                onClick={() => setConfirmRemoveId(null)}
                                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-[#F5F2FF]"
                              >
                                <X className="h-3 w-3" style={{ color: '#8E8EA0' }} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRemoveId(m.profile.id)}
                              className="h-7 w-7 rounded-md flex items-center justify-center transition-colors hover:bg-red-50"
                              title="Remove from workspace"
                            >
                              <UserMinus className="h-3.5 w-3.5" style={{ color: '#E55B5B' }} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Video Calls (LiveKit) */}
          {isAdmin && (
            <div className="space-y-3">
              <Label className="text-[13px] font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: '#8E8EA0' }}>
                <Video className="h-3.5 w-3.5" />
                Video Calls (LiveKit)
              </Label>

              <div className="p-3 rounded-xl space-y-3" style={{ background: '#F5F2FF', border: '1px solid #E5E1EE' }}>
                <p className="text-[12px]" style={{ color: '#8E8EA0' }}>
                  Connect a{' '}
                  <a
                    href="https://livekit.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium hover:underline"
                    style={{ color: '#7C5CFC' }}
                  >
                    LiveKit
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  {' '}server to enable audio & video calls in your workspace.
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: '#4A4860' }}>
                      LiveKit Server URL
                    </label>
                    <Input
                      placeholder="wss://your-project.livekit.cloud"
                      value={livekitConfig.livekit_url}
                      onChange={(e) => setLivekitConfig((c) => ({ ...c, livekit_url: e.target.value }))}
                      className="h-8 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: '#4A4860' }}>
                      API Key
                    </label>
                    <Input
                      placeholder="APIxxxxxxxxx"
                      value={livekitConfig.livekit_api_key}
                      onChange={(e) => setLivekitConfig((c) => ({ ...c, livekit_api_key: e.target.value }))}
                      className="h-8 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: '#4A4860' }}>
                      API Secret
                    </label>
                    <Input
                      type="password"
                      placeholder="Your LiveKit API secret"
                      value={livekitConfig.livekit_api_secret}
                      onChange={(e) => setLivekitConfig((c) => ({ ...c, livekit_api_secret: e.target.value }))}
                      className="h-8 text-[13px]"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={livekitConfig.calls_enabled}
                        onChange={(e) => setLivekitConfig((c) => ({ ...c, calls_enabled: e.target.checked }))}
                        className="rounded"
                        style={{ accentColor: '#7C5CFC' }}
                      />
                      <span className="text-[13px] font-medium" style={{ color: '#2D2B3D' }}>
                        Enable calls
                      </span>
                    </label>

                    <Button
                      size="sm"
                      onClick={saveLivekitConfig}
                      disabled={savingLivekit}
                      className="h-8 px-4 text-[12px]"
                      style={{ background: '#7C5CFC', color: '#fff' }}
                    >
                      {savingLivekit ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : livekitSaved ? (
                        <><Check className="h-3 w-3 mr-1" />Saved</>
                      ) : (
                        'Save'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Your role info */}
          <div className="px-3 py-2 rounded-lg text-[12px]" style={{ background: '#F5F2FF', color: '#8E8EA0' }}>
            Your role: <strong style={{ color: '#2D2B3D' }}>{roleLabel(workspaceRole || 'member')}</strong>
            {isAdmin && ' — You can manage members and workspace settings.'}
            {!isAdmin && ' — Contact an admin to change workspace settings.'}
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
