'use client'

import { useState, useEffect } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import { Bookmark, X, Loader2, Trash2, Wrench } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Message, SavedItem } from '@/types/database'

interface SavedItemsPanelProps {
  open: boolean
  onClose: () => void
}

const SAVED_ITEMS_SQL = `
CREATE TABLE IF NOT EXISTS saved_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, message_id)
);
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si_select" ON saved_items;
DROP POLICY IF EXISTS "si_insert" ON saved_items;
DROP POLICY IF EXISTS "si_delete" ON saved_items;
CREATE POLICY "si_select" ON saved_items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "si_insert" ON saved_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "si_delete" ON saved_items FOR DELETE USING (user_id = auth.uid());
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE saved_items; EXCEPTION WHEN OTHERS THEN NULL; END $$;
`

export function SavedItemsPanel({ open, onClose }: SavedItemsPanelProps) {
  const { user, workspace, setSavedItemIds, toggleSavedItem, setCurrentChannelId } = useAppStore()
  const [savedItems, setSavedItems] = useState<(SavedItem & { message: Message })[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Fix flow
  const [showFix, setShowFix] = useState(false)
  const [pat, setPat] = useState('')
  const [fixing, setFixing] = useState(false)
  const [fixError, setFixError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !user || !workspace) return
    loadSavedItems()
  }, [open, user, workspace])

  async function loadSavedItems() {
    const client = getSupabaseClient()
    if (!client || !user || !workspace) return

    setLoading(true)
    setLoadError(null)
    try {
      const { data, error } = await client
        .from('saved_items')
        .select('*, message:messages(*, sender:profiles(*))')
        .eq('user_id', user.id)
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: false })

      if (error) {
        setLoadError('table_missing')
        return
      }

      if (data) {
        const items = (data as (SavedItem & { message: Message })[]).filter(
          (item) => item.message && !item.message.is_deleted
        )
        setSavedItems(items)
        const ids = new Set(items.map((item) => item.message_id))
        setSavedItemIds(ids)
      }
    } catch {
      setLoadError('table_missing')
    } finally {
      setLoading(false)
    }
  }

  async function handleFix() {
    if (!pat.trim()) return
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const match = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)
    if (!match) {
      setFixError('Could not extract project ref from Supabase URL.')
      return
    }
    const projectRef = match[1]

    setFixing(true)
    setFixError(null)
    try {
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRef, accessToken: pat.trim(), sql: SAVED_ITEMS_SQL }),
      })
      const result = await res.json()

      if (!res.ok) {
        setFixError(result.error || 'Failed to create table')
        return
      }

      // Success — reload
      setShowFix(false)
      setPat('')
      setLoadError(null)
      await loadSavedItems()
    } catch (err) {
      setFixError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setFixing(false)
    }
  }

  async function handleRemove(item: SavedItem) {
    const client = getSupabaseClient()
    if (!client || !user) return

    await client.from('saved_items').delete().eq('id', item.id)
    setSavedItems((prev) => prev.filter((i) => i.id !== item.id))
    toggleSavedItem(item.message_id)
  }

  async function handleGoToMessage(item: SavedItem & { message: Message }) {
    setCurrentChannelId(item.message.channel_id)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-md bg-white shadow-xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid #E5E1EE' }}>
          <div className="flex items-center gap-2">
            <Bookmark className="h-5 w-5" style={{ color: '#7C5CFC' }} />
            <h2 className="font-bold text-[17px]" style={{ color: '#2D2B3D' }}>Saved Items</h2>
            {savedItems.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#EDE5FF', color: '#7C5CFC' }}>
                {savedItems.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[#F5F2FF] transition-colors"
          >
            <X className="h-4 w-4" style={{ color: '#8E8EA0' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loadError ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#FEE2E2' }}>
                <Bookmark className="h-7 w-7" style={{ color: '#E55B5B' }} />
              </div>
              <h3 className="text-base font-bold mb-1" style={{ color: '#2D2B3D' }}>Database update needed</h3>
              <p className="text-sm mb-4" style={{ color: '#8E8EA0' }}>
                The saved_items table is missing. Click below to create it using your Supabase access token.
              </p>

              {showFix ? (
                <div className="w-full max-w-xs space-y-3">
                  <div>
                    <label className="text-[11px] font-medium mb-1 block text-left" style={{ color: '#4A4860' }}>
                      Supabase Personal Access Token
                    </label>
                    <input
                      type="password"
                      value={pat}
                      onChange={(e) => setPat(e.target.value)}
                      placeholder="sbp_..."
                      className="w-full h-9 px-3 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]"
                      style={{ borderColor: '#E5E1EE' }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleFix() }}
                      autoFocus
                    />
                    <p className="text-[10px] mt-1 text-left" style={{ color: '#8E8EA0' }}>
                      Get it from{' '}
                      <a
                        href="https://supabase.com/dashboard/account/tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                        style={{ color: '#7C5CFC' }}
                      >
                        supabase.com/dashboard/account/tokens
                      </a>
                    </p>
                  </div>
                  {fixError && (
                    <p className="text-xs p-2 rounded-lg" style={{ background: '#FEE2E2', color: '#E55B5B' }}>
                      {fixError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowFix(false); setFixError(null) }}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-gray-50"
                      style={{ borderColor: '#E5E1EE', color: '#8E8EA0' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleFix}
                      disabled={fixing || !pat.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                      style={{ background: '#7C5CFC' }}
                    >
                      {fixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                      {fixing ? 'Creating...' : 'Create table'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowFix(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
                  style={{ background: '#7C5CFC' }}
                >
                  <Wrench className="h-4 w-4" />
                  Fix now
                </button>
              )}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin mr-2" style={{ color: '#7C5CFC' }} />
              <span style={{ color: '#8E8EA0' }}>Loading saved items...</span>
            </div>
          ) : savedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#EDE5FF' }}>
                <Bookmark className="h-7 w-7" style={{ color: '#7C5CFC' }} />
              </div>
              <h3 className="text-base font-bold mb-1" style={{ color: '#2D2B3D' }}>No saved items yet</h3>
              <p className="text-sm" style={{ color: '#8E8EA0' }}>
                Click the bookmark icon on any message to save it here for later.
              </p>
            </div>
          ) : (
            <div className="py-2">
              {savedItems.map((item) => {
                const msg = item.message
                const sender = msg.sender
                const displayName = sender?.display_name || 'Unknown'
                const initial = displayName[0]?.toUpperCase() || '?'
                const time = formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })
                const savedTime = formatDistanceToNow(new Date(item.created_at), { addSuffix: true })

                return (
                  <div
                    key={item.id}
                    className="group px-5 py-3 hover:bg-[#F5F2FF] transition-colors cursor-pointer"
                    onClick={() => handleGoToMessage(item)}
                  >
                    <div className="flex items-start gap-2.5">
                      {sender?.avatar_url ? (
                        <img src={sender.avatar_url} alt={displayName} className="h-8 w-8 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className="h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: '#7C5CFC' }}>
                          {initial}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-[14px]" style={{ color: '#2D2B3D' }}>
                            {displayName}
                          </span>
                          <span className="text-[11px]" style={{ color: '#8E8EA0' }}>{time}</span>
                        </div>
                        <p
                          className="text-[14px] leading-[1.4] mt-0.5 line-clamp-3"
                          style={{ color: '#4A4860' }}
                        >
                          {msg.content}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px]" style={{ color: '#8E8EA0' }}>
                            Saved {savedTime}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemove(item)
                        }}
                        className="h-7 w-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#EDE5FF]"
                        title="Remove from saved"
                      >
                        <Trash2 className="h-3.5 w-3.5" style={{ color: '#E55B5B' }} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
