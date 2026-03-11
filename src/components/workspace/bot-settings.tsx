'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import { Plus, Copy, Trash2, Bot as BotIcon, Check, Key } from 'lucide-react'
import type { Bot } from '@/types/database'

export function BotSettings() {
  const { user, workspace } = useAppStore()
  const [bots, setBots] = useState<Bot[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showToken, setShowToken] = useState<string | null>(null)

  useEffect(() => {
    loadBots()
  }, [workspace])

  async function loadBots() {
    const client = getSupabaseClient()
    if (!client || !workspace) return

    const { data } = await client
      .from('bots')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })

    if (data) setBots(data as Bot[])
    setLoading(false)
  }

  async function createBot() {
    const client = getSupabaseClient()
    if (!client || !workspace || !user || !newName.trim()) return

    setCreating(true)
    try {
      const { data, error } = await client
        .from('bots')
        .insert({
          workspace_id: workspace.id,
          name: newName.trim().toLowerCase().replace(/\s+/g, '-'),
          display_name: newName.trim(),
          description: newDescription.trim() || null,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setBots(prev => [data as Bot, ...prev])
        setNewName('')
        setNewDescription('')
      }
    } catch (err) {
      console.error('Failed to create bot:', err)
    }
    setCreating(false)
  }

  async function deleteBot(id: string) {
    const client = getSupabaseClient()
    if (!client) return

    await client.from('bots').delete().eq('id', id)
    setBots(prev => prev.filter(b => b.id !== id))
  }

  function copyToken(bot: Bot) {
    navigator.clipboard.writeText(bot.bot_token)
    setCopiedId(bot.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1" style={{ color: '#2D2B3D' }}>Bots</h3>
        <p className="text-xs" style={{ color: '#8E8EA0' }}>
          Create bots that can send messages and respond to events.
        </p>
      </div>

      {/* Create new bot */}
      <div className="p-4 rounded-xl border" style={{ borderColor: '#E5E1EE', background: '#F5F2FF' }}>
        <p className="text-xs font-medium mb-3" style={{ color: '#4A4860' }}>Create new bot</p>
        <div className="space-y-2">
          <Input
            placeholder="Bot name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <Button
            onClick={createBot}
            disabled={!newName.trim() || creating}
            size="sm"
            className="w-full"
            style={{ background: '#7C5CFC', color: '#fff' }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Bot
          </Button>
        </div>
      </div>

      {/* Bot list */}
      {loading ? (
        <p className="text-sm text-center py-4" style={{ color: '#8E8EA0' }}>Loading...</p>
      ) : bots.length === 0 ? (
        <div className="text-center py-8">
          <BotIcon className="h-8 w-8 mx-auto mb-2" style={{ color: '#DDD6F3' }} />
          <p className="text-sm" style={{ color: '#8E8EA0' }}>No bots yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bots.map(bot => (
            <div
              key={bot.id}
              className="p-3 rounded-xl border"
              style={{ borderColor: '#E5E1EE' }}
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#EDE5FF' }}>
                  <BotIcon className="h-4 w-4" style={{ color: '#7C5CFC' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#2D2B3D' }}>{bot.display_name}</p>
                  {bot.description && (
                    <p className="text-xs truncate" style={{ color: '#8E8EA0' }}>{bot.description}</p>
                  )}
                </div>
                <button
                  onClick={() => setShowToken(showToken === bot.id ? null : bot.id)}
                  className="h-7 px-2.5 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors hover:bg-[#F5F2FF]"
                  style={{ color: '#7C5CFC' }}
                  title="Show token"
                >
                  <Key className="h-3 w-3" />
                  Token
                </button>
                <button
                  onClick={() => deleteBot(bot.id)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors"
                  title="Delete bot"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </button>
              </div>
              {showToken === bot.id && (
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 text-xs px-2 py-1 rounded-lg bg-[#F5F2FF] font-mono truncate" style={{ color: '#4A4860' }}>
                    {bot.bot_token}
                  </code>
                  <button
                    onClick={() => copyToken(bot)}
                    className="h-6 px-2 rounded text-xs flex items-center gap-1 hover:bg-[#F5F2FF]"
                    style={{ color: '#7C5CFC' }}
                  >
                    {copiedId === bot.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
