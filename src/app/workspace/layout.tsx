'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import { Sidebar } from '@/components/sidebar/sidebar'
import { ActivityPanel } from '@/components/activity/activity-panel'
import { CallPanel } from '@/components/calls/call-panel'
import { IncomingCallBanner } from '@/components/calls/incoming-call-banner'
import { WorkspaceSetup } from '@/components/workspace/workspace-setup'
import type { Profile, Workspace, WorkspaceMember, Channel } from '@/types/database'
import { Loader2 } from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'
import { usePresence } from '@/hooks/use-presence'
import { useScheduledMessages } from '@/hooks/use-scheduled-messages'
import { useMobile } from '@/hooks/use-mobile'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, workspace, setUser, setWorkspace, setWorkspaceRole, setChannels, setCurrentChannelId, sidebarOpen, setSidebarOpen } = useAppStore()
  const { isMobile, isTablet, isDesktop } = useMobile()
  const [loading, setLoading] = useState(true)
  const [showWorkspaceSetup, setShowWorkspaceSetup] = useState(false)

  // Enable browser notifications for mentions and DMs
  useNotifications()

  // Track user presence (online status + last_seen_at)
  usePresence()

  // Poll and send scheduled messages when due
  useScheduledMessages()

  useEffect(() => {
    loadUserData()
    // Ensure storage buckets exist (fire-and-forget)
    fetch('/api/storage', { method: 'POST' }).catch(() => {})
  }, [])

  async function loadUserData() {
    const client = getSupabaseClient()
    if (!client) {
      router.push('/setup')
      return
    }

    try {
      const { data: { session } } = await client.auth.getSession()
      if (!session) {
        router.push('/auth')
        return
      }

      // Load profile
      const { data: profile } = await client
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (!profile) {
        router.push('/auth')
        return
      }

      setUser(profile as Profile)

      // Find workspace membership
      const { data: members } = await client
        .from('workspace_members')
        .select('*, workspace:workspaces(*)')
        .eq('profile_id', session.user.id)
        .limit(1)

      const member = members?.[0] as (WorkspaceMember & { workspace: Workspace }) | undefined
      if (member?.workspace) {
        setWorkspace(member.workspace)
        setWorkspaceRole(member.role)
        await loadChannels(member.workspace.id)
        // Load saved item IDs for bookmark state
        loadSavedItemIds(session.user.id, member.workspace.id)
      } else {
        setShowWorkspaceSetup(true)
      }
    } catch (err) {
      console.error('Failed to load user data:', err)
      router.push('/auth')
    } finally {
      setLoading(false)
    }
  }

  async function loadSavedItemIds(userId: string, workspaceId: string) {
    const client = getSupabaseClient()
    if (!client) return
    try {
      const { data, error } = await client
        .from('saved_items')
        .select('message_id')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
      if (error) return // Table may not exist yet — silently ignore
      if (data) {
        const ids = new Set(data.map((d: { message_id: string }) => d.message_id))
        useAppStore.getState().setSavedItemIds(ids)
      }
    } catch {
      // saved_items table missing — feature will be unavailable until re-provisioned
    }
  }

  async function loadChannels(workspaceId: string) {
    const client = getSupabaseClient()
    if (!client) return

    const userId = useAppStore.getState().user?.id
    if (!userId) return

    // Only load channels the user is a member of
    const { data: myMemberships } = await client
      .from('channel_members')
      .select('channel_id')
      .eq('profile_id', userId)

    if (!myMemberships || myMemberships.length === 0) return

    const myChannelIds = myMemberships.map((m) => m.channel_id)

    const { data: myChannels } = await client
      .from('channels')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false)
      .in('id', myChannelIds)
      .order('name')

    // Filter out DM and group DM channels (they're shown separately in the DM section)
    const allChannels = ((myChannels || []) as Channel[]).filter(
      (c) => !c.name.startsWith('dm-') && !c.name.startsWith('gdm-')
    )

    if (allChannels.length > 0) {
      setChannels(allChannels)
      // Default to #general or first channel
      const general = allChannels.find((c: Channel) => c.name === 'general') || allChannels[0]
      setCurrentChannelId(general.id)
    }
  }

  async function handleWorkspaceCreated(ws: Workspace) {
    setWorkspace(ws)
    setShowWorkspaceSetup(false)
    await loadChannels(ws.id)
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (showWorkspaceSetup) {
    return <WorkspaceSetup onCreated={handleWorkspaceCreated} />
  }

  if (!workspace) {
    return null
  }

  return (
    <div className="h-screen flex bg-background relative overflow-hidden">
      <IncomingCallBanner />

      {/* Sidebar - Desktop: always visible, Mobile/Tablet: overlay drawer */}
      {isDesktop ? (
        <Sidebar />
      ) : (
        <>
          {/* Backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/30 z-40 transition-opacity"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          {/* Drawer */}
          <div className={`fixed left-0 top-0 h-full z-50 transition-transform duration-200 ease-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}>
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      <ActivityPanel />
      <main className="flex-1 flex flex-col min-w-0">{children}</main>
      <CallPanel />
    </div>
  )
}
