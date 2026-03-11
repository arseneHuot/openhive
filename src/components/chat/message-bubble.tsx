'use client'

import { useState, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { MessageSquare, Smile, MoreHorizontal, Pencil, Trash2, Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSupabaseClient } from '@/lib/supabase/client'
import DOMPurify from 'dompurify'
import { useAppStore } from '@/lib/store/app-store'
import { EmojiPicker, QUICK_REACTIONS } from './emoji-picker'
import type { Message, Reaction } from '@/types/database'

// Global cache for resolved mention display names (userId -> displayName)
const mentionNameCache: Record<string, string> = {}

// Render message content with markdown-like formatting
function renderMessageContent(text: string, mentionNames?: Record<string, string>): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html.replace(/```\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>')
  html = html.replace(/@([a-f0-9-]{36})/g, (_match, uuid) => {
    const name = mentionNames?.[uuid] || mentionNameCache[uuid] || uuid.slice(0, 8)
    return `<span class="mention-highlight">@${name}</span>`
  })
  html = html.replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>')
  html = html.replace(
    /📎\s*\[([^\]]+)\]\(([^)]+)\)/g,
    '📎 <a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  )
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  )
  html = html.replace(
    /(?<!["\w])(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  )

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'em', 'code', 'pre', 'a', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  })
}

interface MessageBubbleProps {
  message: Message
  showHeader: boolean
  isOwn: boolean
  isThread?: boolean
}

export function MessageBubble({ message, showHeader, isOwn, isThread }: MessageBubbleProps) {
  const { user, openThread, openProfile, reactions, setReactions, addReaction, removeReaction, savedItemIds, toggleSavedItem } = useAppStore()
  const [hovered, setHovered] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [saveError, setSaveError] = useState(false)
  const [mentionNames, setMentionNames] = useState<Record<string, string>>({})
  const containerRef = useRef<HTMLDivElement>(null)

  const sender = message.sender
  const displayName = sender?.display_name || 'Unknown'
  const initial = displayName[0]?.toUpperCase() || '?'
  const time = formatDistanceToNow(new Date(message.created_at), { addSuffix: true })
  const messageReactions = reactions[message.id] || []

  // Resolve @mention UUIDs to display names
  useEffect(() => {
    const uuids = [...message.content.matchAll(/@([a-f0-9-]{36})/g)].map((m) => m[1])
    if (uuids.length === 0) return

    // Check cache first
    const uncached = uuids.filter((id) => !mentionNameCache[id])
    if (uncached.length === 0) {
      setMentionNames({ ...mentionNameCache })
      return
    }

    const client = getSupabaseClient()
    if (!client) return

    client
      .from('profiles')
      .select('id, display_name')
      .in('id', uncached)
      .then(({ data }) => {
        if (data) {
          const resolved: Record<string, string> = { ...mentionNameCache }
          data.forEach((p: { id: string; display_name: string }) => {
            mentionNameCache[p.id] = p.display_name
            resolved[p.id] = p.display_name
          })
          setMentionNames(resolved)
        }
      })
  }, [message.content])

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) return
    client
      .from('reactions')
      .select('*')
      .eq('message_id', message.id)
      .then(({ data }) => {
        if (data) setReactions(message.id, data as Reaction[])
      })
  }, [message.id])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false)
        setShowMoreMenu(false)
      }
    }
    if (showEmojiPicker || showMoreMenu) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [showEmojiPicker, showMoreMenu])

  async function handleReaction(emoji: string) {
    const client = getSupabaseClient()
    if (!client || !user) return

    const existing = messageReactions.find(
      (r) => r.emoji === emoji && r.profile_id === user.id
    )

    if (existing) {
      await client.from('reactions').delete().eq('id', existing.id)
      removeReaction(message.id, existing.id)
    } else {
      const { data } = await client
        .from('reactions')
        .insert({ message_id: message.id, profile_id: user.id, emoji })
        .select()
        .single()
      if (data) addReaction(message.id, data as Reaction)
    }
    setShowEmojiPicker(false)
  }

  async function handleEdit() {
    const client = getSupabaseClient()
    if (!client || !editContent.trim()) return
    await client.from('messages').update({ content: editContent.trim(), is_edited: true }).eq('id', message.id)
    message.content = editContent.trim()
    message.is_edited = true
    setEditing(false)
  }

  async function handleDelete() {
    const client = getSupabaseClient()
    if (!client) return
    await client.from('messages').update({ is_deleted: true }).eq('id', message.id)
    setShowMoreMenu(false)
  }

  const grouped = messageReactions.reduce<
    Record<string, { emoji: string; count: number; myReaction: boolean }>
  >((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { emoji: r.emoji, count: 0, myReaction: false }
    acc[r.emoji].count++
    if (r.profile_id === user?.id) acc[r.emoji].myReaction = true
    return acc
  }, {})

  const showToolbar = hovered || showEmojiPicker || showMoreMenu

  return (
    <div ref={containerRef}>
      <div
        className={`relative flex gap-2.5 px-3 -mx-3 rounded-xl ${showHeader ? 'pt-2 py-1' : 'py-0.5'} ${showToolbar ? 'bg-[#F5F2FF]' : 'hover:bg-[#F5F2FF]'}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* ACTION TOOLBAR */}
        {showToolbar && !editing && (
          <div className="absolute top-0 right-2 flex items-center bg-white border border-[#E5E1EE] rounded-xl shadow-sm z-10 -translate-y-1/2">
            {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="h-8 w-8 flex items-center justify-center hover:bg-[#F5F2FF] rounded-xl text-sm transition-colors"
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            <div className="relative">
              <button
                onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowMoreMenu(false) }}
                className="h-8 w-8 flex items-center justify-center hover:bg-[#F5F2FF] rounded-xl transition-colors text-[#8E8EA0]"
                title="Add reaction"
              >
                <Smile className="h-4 w-4" />
              </button>
              {showEmojiPicker && (
                <div className="absolute right-0 top-9 z-50">
                  <EmojiPicker onSelect={handleReaction} onClose={() => setShowEmojiPicker(false)} />
                </div>
              )}
            </div>
            {!isThread && (
              <button
                onClick={() => openThread(message)}
                className="h-8 w-8 flex items-center justify-center hover:bg-[#F5F2FF] rounded-xl transition-colors text-[#8E8EA0]"
                title="Reply in thread"
              >
                <MessageSquare className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={async () => {
                const client = getSupabaseClient()
                if (!client || !user) return
                const isSaved = savedItemIds.has(message.id)
                try {
                  if (isSaved) {
                    const { error } = await client.from('saved_items').delete().eq('message_id', message.id).eq('user_id', user.id)
                    if (error) throw error
                    toggleSavedItem(message.id)
                  } else {
                    const workspaceId = useAppStore.getState().workspace?.id
                    if (!workspaceId) return
                    const { error } = await client.from('saved_items').insert({
                      user_id: user.id,
                      message_id: message.id,
                      workspace_id: workspaceId,
                    })
                    if (error) throw error
                    toggleSavedItem(message.id)
                  }
                } catch (err) {
                  console.error('Failed to save/unsave item:', err)
                  setSaveError(true)
                  setTimeout(() => setSaveError(false), 3000)
                }
              }}
              className={`h-8 w-8 flex items-center justify-center hover:bg-[#F5F2FF] rounded-xl transition-colors ${
                savedItemIds.has(message.id) ? 'text-[#7C5CFC]' : 'text-[#8E8EA0]'
              }`}
              title={savedItemIds.has(message.id) ? 'Remove from saved' : 'Save message'}
            >
              <Bookmark className={`h-4 w-4 ${savedItemIds.has(message.id) ? 'fill-current' : ''}`} />
            </button>
            {saveError && (
              <div className="absolute right-0 top-9 bg-red-50 border border-red-200 text-red-600 text-[11px] px-2 py-1 rounded-lg whitespace-nowrap z-50 shadow-sm">
                Failed — open Saved Items panel to fix
              </div>
            )}
            <div className="relative">
              <button
                onClick={() => { setShowMoreMenu(!showMoreMenu); setShowEmojiPicker(false) }}
                className="h-8 w-8 flex items-center justify-center hover:bg-[#F5F2FF] rounded-xl transition-colors text-[#8E8EA0]"
                title="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 top-9 bg-white border border-[#E5E1EE] rounded-xl shadow-lg py-1 min-w-[180px] z-50">
                  {isOwn && (
                    <button
                      onClick={() => { setEditing(true); setEditContent(message.content); setShowMoreMenu(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#F5F2FF] text-left text-[#2D2B3D] rounded-lg mx-0"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit message
                    </button>
                  )}
                  {!isThread && (
                    <button
                      onClick={() => { openThread(message); setShowMoreMenu(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#F5F2FF] text-left text-[#2D2B3D] rounded-lg"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> Reply in thread
                    </button>
                  )}
                  {isOwn && (
                    <button
                      onClick={handleDelete}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-[#E55B5B] text-left rounded-lg"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete message
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AVATAR / TIMESTAMP */}
        {showHeader ? (
          <button
            onClick={() => message.sender_id && openProfile(message.sender_id)}
            className="h-9 w-9 rounded-xl shrink-0 mt-0.5 hover:opacity-80 transition-opacity cursor-pointer overflow-hidden"
          >
            {sender?.avatar_url ? (
              <img src={sender.avatar_url} alt={displayName} className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <div className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold text-white" style={{ background: '#7C5CFC' }}>
                {initial}
              </div>
            )}
          </button>
        ) : (
          <div className="w-9 shrink-0 flex items-center justify-center">
            <span className={`text-[10px] text-[#8E8EA0] transition-opacity ${showToolbar ? 'opacity-100' : 'opacity-0'}`}>
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        {/* CONTENT */}
        <div className="min-w-0 flex-1">
          {showHeader && (
            <div className="flex items-baseline gap-2">
              <button
                onClick={() => message.sender_id && openProfile(message.sender_id)}
                className="font-semibold text-[15px] hover:underline cursor-pointer"
                style={{ color: '#2D2B3D' }}
              >
                {displayName}
              </button>
              <span className="text-xs" style={{ color: '#8E8EA0' }}>{time}</span>
              {message.is_edited && <span className="text-xs italic" style={{ color: '#8E8EA0' }}>(edited)</span>}
            </div>
          )}
          {editing ? (
            <div className="mt-1">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full text-[15px] bg-white rounded-xl p-3 border border-[#E5E1EE] focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] focus:border-transparent"
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit() }
                  if (e.key === 'Escape') setEditing(false)
                }}
              />
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={handleEdit} style={{ background: '#7C5CFC', color: '#fff' }}>Save</Button>
              </div>
            </div>
          ) : (
            <div
              className="text-[15px] leading-[1.5] whitespace-pre-wrap break-words message-content"
              style={{ color: '#2D2B3D' }}
              dangerouslySetInnerHTML={{ __html: renderMessageContent(message.content, mentionNames) }}
            />
          )}
        </div>
      </div>

      {/* REACTIONS */}
      {Object.keys(grouped).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 ml-11">
          {Object.values(grouped).map((r) => (
            <button
              key={r.emoji}
              onClick={() => handleReaction(r.emoji)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                r.myReaction
                  ? 'bg-[#EDE5FF] border-[#7C5CFC]/30 text-[#7C5CFC]'
                  : 'bg-[#F5F2FF] border-[#E5E1EE] hover:border-[#DDD6F3]'
              }`}
            >
              <span>{r.emoji}</span>
              <span>{r.count}</span>
            </button>
          ))}
          <button
            onClick={() => setShowEmojiPicker(true)}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border border-dashed border-[#DDD6F3] hover:border-[#7C5CFC] text-[#8E8EA0]"
          >
            <Smile className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* THREAD INDICATOR */}
      {!isThread && message.thread_reply_count > 0 && (
        <button
          onClick={() => openThread(message)}
          className="flex items-center gap-1.5 ml-11 mt-1 text-xs hover:underline font-semibold"
          style={{ color: '#7C5CFC' }}
        >
          <MessageSquare className="h-3 w-3" />
          {message.thread_reply_count} {message.thread_reply_count === 1 ? 'reply' : 'replies'}
        </button>
      )}
    </div>
  )
}
