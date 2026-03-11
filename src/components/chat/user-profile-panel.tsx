'use client'

import { useEffect, useState } from 'react'
import { X, Mail, Clock, Circle, MessageSquare, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import { ProfileEditDialog } from '@/components/profile/profile-edit-dialog'
import { formatDistanceToNow } from 'date-fns'
import type { Profile } from '@/types/database'

export function UserProfilePanel() {
  const { user, profileUserId, closeProfile, workspace } = useAppStore()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)

  const isOwnProfile = user?.id === profileUserId

  useEffect(() => {
    if (!profileUserId) return
    const client = getSupabaseClient()
    if (!client) return

    setLoading(true)

    client
      .from('profiles')
      .select('*')
      .eq('id', profileUserId)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data as Profile)
        setLoading(false)
      })

    if (workspace) {
      client
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspace.id)
        .eq('profile_id', profileUserId)
        .single()
        .then(({ data }) => {
          if (data) setRole(data.role)
        })
    }
  }, [profileUserId, workspace])

  useEffect(() => {
    if (isOwnProfile && user) {
      setProfile(user)
    }
  }, [isOwnProfile, user])

  if (!profileUserId) return null

  const displayName = profile?.display_name || 'Loading...'
  const initial = displayName[0]?.toUpperCase() || '?'
  const isOnline = profile?.is_online ?? false

  return (
    <>
      <div className="w-80 flex flex-col h-full shrink-0" style={{ background: '#ffffff', borderLeft: '1px solid #E5E1EE' }}>
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid #E5E1EE' }}>
          <h3 className="font-bold text-[17px]" style={{ color: '#2D2B3D' }}>Profile</h3>
          <button className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[#F5F2FF] transition-colors" onClick={closeProfile}>
            <X className="h-4 w-4" style={{ color: '#8E8EA0' }} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#8E8EA0' }}>
            Loading profile...
          </div>
        ) : profile ? (
          <div className="flex-1 overflow-y-auto">
            {/* Avatar + name */}
            <div className="flex flex-col items-center pt-8 pb-4 px-4">
              <div className="relative mb-3">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    className="h-[120px] w-[120px] rounded-2xl object-cover shadow-sm"
                  />
                ) : (
                  <div className="h-[120px] w-[120px] rounded-2xl flex items-center justify-center text-4xl font-bold text-white shadow-sm" style={{ background: '#7C5CFC' }}>
                    {initial}
                  </div>
                )}
                <div className="absolute bottom-1.5 right-1.5">
                  <Circle
                    className={`h-4 w-4 ${
                      isOnline ? 'fill-green-500 text-green-500' : 'fill-gray-300 text-gray-300'
                    }`}
                    strokeWidth={3}
                    stroke="#ffffff"
                  />
                </div>
              </div>

              <h2 className="text-xl font-bold" style={{ color: '#2D2B3D' }}>{displayName}</h2>

              {(profile.status_emoji || profile.status_text) && (
                <div className="flex items-center gap-1.5 mt-1.5 text-sm" style={{ color: '#8E8EA0' }}>
                  {profile.status_emoji && <span>{profile.status_emoji}</span>}
                  {profile.status_text && <span>{profile.status_text}</span>}
                </div>
              )}

              {role && (
                <span
                  className="mt-2.5 text-xs px-3 py-1 rounded-full font-medium"
                  style={{
                    background: role === 'owner' ? '#FEF3C7' : role === 'admin' ? '#EDE5FF' : '#F5F2FF',
                    color: role === 'owner' ? '#92400E' : role === 'admin' ? '#7C5CFC' : '#8E8EA0',
                    border: `1px solid ${role === 'owner' ? '#FDE68A' : role === 'admin' ? '#DDD6F3' : '#E5E1EE'}`,
                  }}
                >
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </span>
              )}

              {isOwnProfile && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-xl"
                  onClick={() => setEditOpen(true)}
                  style={{ borderColor: '#E5E1EE', color: '#4A4860' }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit Profile
                </Button>
              )}
            </div>

            {/* Details section */}
            <div className="px-5 space-y-4 pb-6">
              {profile.email && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8E8EA0' }}>
                    Email Address
                  </label>
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 shrink-0" style={{ color: '#8E8EA0' }} />
                    <a
                      href={`mailto:${profile.email}`}
                      className="hover:underline truncate"
                      style={{ color: '#7C5CFC' }}
                    >
                      {profile.email}
                    </a>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8E8EA0' }}>
                  {isOnline ? 'Status' : 'Last Seen'}
                </label>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 shrink-0" style={{ color: '#8E8EA0' }} />
                  <span style={{ color: '#2D2B3D' }}>
                    {isOnline
                      ? 'Active now'
                      : profile.last_seen_at
                      ? formatDistanceToNow(new Date(profile.last_seen_at), { addSuffix: true })
                      : 'Never'}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8E8EA0' }}>
                  Joined
                </label>
                <div className="flex items-center gap-2 text-sm">
                  <MessageSquare className="h-4 w-4 shrink-0" style={{ color: '#8E8EA0' }} />
                  <span style={{ color: '#2D2B3D' }}>
                    {new Date(profile.created_at).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#8E8EA0' }}>
            Profile not found
          </div>
        )}
      </div>

      <ProfileEditDialog open={editOpen} onOpenChange={setEditOpen} />
    </>
  )
}
