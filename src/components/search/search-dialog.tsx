'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import { Search, Hash, Lock, MessageSquare, User, Loader2, ArrowRight, Clock, Sparkles } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Channel, Message, Profile } from '@/types/database'

interface SearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Result =
  | { type: 'channel'; channel: Channel }
  | { type: 'message'; message: Message & { sender?: Profile; channel_name?: string } }
  | { type: 'user'; user: Profile }

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const { workspace, user, channels, dmChannels, setCurrentChannelId, setPreviewChannel, openProfile } = useAppStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const search = useCallback(
    async (q: string) => {
      const client = getSupabaseClient()
      if (!client || !workspace || !user || !q.trim()) {
        setResults([])
        return
      }

      setLoading(true)
      const all: Result[] = []

      try {
        const { data: myMemberships } = await client
          .from('channel_members')
          .select('channel_id')
          .eq('profile_id', user.id)

        const myChannelIds = new Set(myMemberships?.map((m) => m.channel_id) || [])

        // Search channels
        const { data: channelsData } = await client
          .from('channels')
          .select('*')
          .eq('workspace_id', workspace.id)
          .eq('is_archived', false)
          .not('name', 'like', 'dm-%')
          .ilike('name', `%${q}%`)
          .limit(10)

        if (channelsData) {
          channelsData
            .filter((c) => !c.is_private || myChannelIds.has(c.id))
            .slice(0, 5)
            .forEach((c) => all.push({ type: 'channel', channel: c as Channel }))
        }

        // Search users
        const { data: members } = await client
          .from('workspace_members')
          .select('profile:profiles(*)')
          .eq('workspace_id', workspace.id)

        if (members) {
          const profiles = members
            .map((m: Record<string, unknown>) => m.profile as Profile)
            .filter(
              (p) =>
                p &&
                (p.display_name.toLowerCase().includes(q.toLowerCase()) ||
                  p.email?.toLowerCase().includes(q.toLowerCase()))
            )
            .slice(0, 5)

          profiles.forEach((u) => all.push({ type: 'user', user: u }))
        }

        // Search messages
        if (myChannelIds.size > 0) {
          const { data: messages } = await client
            .from('messages')
            .select('*, sender:profiles(*)')
            .eq('is_deleted', false)
            .in('channel_id', [...myChannelIds])
            .ilike('content', `%${q}%`)
            .order('created_at', { ascending: false })
            .limit(10)

          if (messages) {
            const channelIds = [...new Set(messages.map((m) => m.channel_id))]
            const { data: channelData } = await client
              .from('channels')
              .select('id, name, is_private')
              .in('id', channelIds)

            const channelMap = new Map(channelData?.map((c) => [c.id, c.name]) || [])

            messages.forEach((m) =>
              all.push({
                type: 'message',
                message: { ...m, channel_name: channelMap.get(m.channel_id) || 'unknown' } as Message & { sender?: Profile; channel_name?: string },
              })
            )
          }
        }
      } catch (err) {
        console.error('Search error:', err)
      }

      setResults(all)
      setActiveIndex(-1)
      setLoading(false)
    },
    [workspace, user]
  )

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const timeout = setTimeout(() => search(query), 300)
    return () => clearTimeout(timeout)
  }, [query, search])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setActiveIndex(-1)
    }
  }, [open])

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    const flatResults = results
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev < flatResults.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatResults.length - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      const r = flatResults[activeIndex]
      if (r.type === 'channel') handleSelectChannel(r.channel)
      else if (r.type === 'user') handleSelectUser(r.user.id)
      else if (r.type === 'message') handleSelectMessage(r.message.channel_id)
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && resultsRef.current) {
      const el = resultsRef.current.querySelector(`[data-index="${activeIndex}"]`)
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  function handleSelectChannel(channel: Channel) {
    const isMember =
      channels.some((c) => c.id === channel.id) ||
      dmChannels.some((c) => c.id === channel.id)

    if (isMember) {
      setCurrentChannelId(channel.id)
    } else {
      setPreviewChannel(channel)
    }
    onOpenChange(false)
  }

  function handleSelectUser(userId: string) {
    openProfile(userId)
    onOpenChange(false)
  }

  function handleSelectMessage(channelId: string) {
    setCurrentChannelId(channelId)
    onOpenChange(false)
  }

  // Highlight matching text
  function highlightMatch(text: string, q: string) {
    if (!q.trim()) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <span className="bg-primary/15 text-primary font-semibold rounded-sm px-0.5">
          {text.slice(idx, idx + q.length)}
        </span>
        {text.slice(idx + q.length)}
      </>
    )
  }

  const channelResults = results.filter((r) => r.type === 'channel')
  const userResults = results.filter((r) => r.type === 'user')
  const messageResults = results.filter((r) => r.type === 'message')

  // Compute flat index for each result for keyboard nav
  let flatIndex = 0
  const channelStartIndex = 0
  const userStartIndex = channelResults.length
  const messageStartIndex = channelResults.length + userResults.length

  // Quick actions for empty state
  const recentChannels = channels.slice(0, 3)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden rounded-xl shadow-2xl border-border/50">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
          <Search className="h-5 w-5 text-muted-foreground/60 shrink-0" />
          <input
            ref={inputRef}
            placeholder="Search messages, channels, people..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/50"
            autoFocus
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-primary/60" />}
        </div>

        {/* Results area */}
        <div ref={resultsRef} className="max-h-[420px] overflow-y-auto">
          {!query.trim() ? (
            /* ===== EMPTY STATE ===== */
            <div className="px-4 py-5">
              {/* Recent channels */}
              {recentChannels.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                      Recent
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {recentChannels.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => { setCurrentChannelId(ch.id); onOpenChange(false) }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted transition-colors text-left group"
                      >
                        <div className="h-7 w-7 rounded-md bg-primary/8 flex items-center justify-center">
                          {ch.is_private ? (
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <span className="text-sm font-medium">{ch.name}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 ml-auto transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search tips */}
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
                <Sparkles className="mx-auto h-5 w-5 text-primary/40 mb-2" />
                <p className="text-sm font-medium text-muted-foreground/80">Search your workspace</p>
                <p className="text-xs text-muted-foreground/50 mt-1">
                  Find messages, channels, and people
                </p>
              </div>
            </div>
          ) : results.length === 0 && !loading ? (
            /* ===== NO RESULTS ===== */
            <div className="px-4 py-10 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground/20 mb-3" />
              <p className="text-sm font-medium text-muted-foreground/70">
                No results for &quot;{query}&quot;
              </p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                Try a different search term
              </p>
            </div>
          ) : (
            /* ===== RESULTS ===== */
            <div className="py-1.5">
              {/* Channels */}
              {channelResults.length > 0 && (
                <div className="mb-1">
                  <div className="flex items-center gap-2 px-4 py-2">
                    <Hash className="h-3 w-3 text-muted-foreground/50" />
                    <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                      Channels
                    </span>
                    <span className="text-[11px] text-muted-foreground/40">{channelResults.length}</span>
                  </div>
                  {channelResults.map((r, i) => {
                    if (r.type !== 'channel') return null
                    const idx = channelStartIndex + i
                    return (
                      <button
                        key={r.channel.id}
                        data-index={idx}
                        onClick={() => handleSelectChannel(r.channel)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2 transition-colors text-left group',
                          activeIndex === idx ? 'bg-primary/8' : 'hover:bg-muted/60'
                        )}
                      >
                        <div className={cn(
                          'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                          activeIndex === idx ? 'bg-primary/15' : 'bg-muted'
                        )}>
                          {r.channel.is_private ? (
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Hash className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">
                            {highlightMatch(r.channel.name, query)}
                          </span>
                          {r.channel.description && (
                            <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
                              {r.channel.description}
                            </p>
                          )}
                        </div>
                        <ArrowRight className={cn(
                          'h-3.5 w-3.5 shrink-0 transition-all',
                          activeIndex === idx ? 'text-primary/60 translate-x-0' : 'text-transparent -translate-x-1'
                        )} />
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Users */}
              {userResults.length > 0 && (
                <div className="mb-1">
                  {(channelResults.length > 0) && <div className="mx-4 border-t border-border/40 my-1" />}
                  <div className="flex items-center gap-2 px-4 py-2">
                    <User className="h-3 w-3 text-muted-foreground/50" />
                    <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                      People
                    </span>
                    <span className="text-[11px] text-muted-foreground/40">{userResults.length}</span>
                  </div>
                  {userResults.map((r, i) => {
                    if (r.type !== 'user') return null
                    const idx = userStartIndex + i
                    return (
                      <button
                        key={r.user.id}
                        data-index={idx}
                        onClick={() => handleSelectUser(r.user.id)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2 transition-colors text-left group',
                          activeIndex === idx ? 'bg-primary/8' : 'hover:bg-muted/60'
                        )}
                      >
                        <div className={cn(
                          'h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
                          activeIndex === idx
                            ? 'bg-primary/15 text-primary'
                            : 'bg-primary/8 text-primary/70'
                        )}>
                          {r.user.avatar_url ? (
                            <img src={r.user.avatar_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                          ) : (
                            r.user.display_name[0]?.toUpperCase() || '?'
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">
                            {highlightMatch(r.user.display_name, query)}
                          </span>
                          {r.user.email && (
                            <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
                              {r.user.email}
                            </p>
                          )}
                        </div>
                        <div className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          r.user.is_online ? 'bg-green-500' : 'bg-muted-foreground/20'
                        )} />
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Messages */}
              {messageResults.length > 0 && (
                <div>
                  {(channelResults.length > 0 || userResults.length > 0) && (
                    <div className="mx-4 border-t border-border/40 my-1" />
                  )}
                  <div className="flex items-center gap-2 px-4 py-2">
                    <MessageSquare className="h-3 w-3 text-muted-foreground/50" />
                    <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                      Messages
                    </span>
                    <span className="text-[11px] text-muted-foreground/40">{messageResults.length}</span>
                  </div>
                  {messageResults.map((r, i) => {
                    if (r.type !== 'message') return null
                    const m = r.message
                    const idx = messageStartIndex + i
                    return (
                      <button
                        key={m.id}
                        data-index={idx}
                        onClick={() => handleSelectMessage(m.channel_id)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-2.5 transition-colors text-left group',
                          activeIndex === idx ? 'bg-primary/8' : 'hover:bg-muted/60'
                        )}
                      >
                        <div className={cn(
                          'h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-colors',
                          activeIndex === idx
                            ? 'bg-primary/15 text-primary'
                            : 'bg-primary/8 text-primary/70'
                        )}>
                          {m.sender?.avatar_url ? (
                            <img src={m.sender.avatar_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                          ) : (
                            (m.sender?.display_name?.[0] || '?').toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">
                              {m.sender?.display_name || 'Unknown'}
                            </span>
                            <span className="text-[11px] text-muted-foreground/50">
                              in #{m.channel_name}
                            </span>
                            <span className="text-[11px] text-muted-foreground/40 ml-auto shrink-0">
                              {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground/70 truncate mt-0.5">
                            {highlightMatch(m.content, query)}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/40 bg-muted/20 px-4 py-2 flex items-center gap-4 text-[11px] text-muted-foreground/50">
          <div className="flex items-center gap-1.5">
            <kbd className="h-4 min-w-4 px-1 rounded bg-muted text-[10px] font-mono flex items-center justify-center border border-border/50">↑</kbd>
            <kbd className="h-4 min-w-4 px-1 rounded bg-muted text-[10px] font-mono flex items-center justify-center border border-border/50">↓</kbd>
            <span>navigate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="h-4 min-w-4 px-1 rounded bg-muted text-[10px] font-mono flex items-center justify-center border border-border/50">↵</kbd>
            <span>open</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <kbd className="h-4 min-w-4 px-1 rounded bg-muted text-[10px] font-mono flex items-center justify-center border border-border/50">esc</kbd>
            <span>close</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
