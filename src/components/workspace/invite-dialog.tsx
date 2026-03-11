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
import { Loader2, Mail, Check, Copy, Link2, Send, Key, AlertTriangle, Info } from 'lucide-react'
import { useAppStore } from '@/lib/store/app-store'
import { getSupabaseClient } from '@/lib/supabase/client'

interface InviteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteDialog({ open, onOpenChange }: InviteDialogProps) {
  const { workspace } = useAppStore()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [hasServiceKey, setHasServiceKey] = useState<boolean | null>(null)
  const [serviceKey, setServiceKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [needsRestart, setNeedsRestart] = useState(false)

  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/auth?workspace=${workspace?.id}`
    : ''

  // Check if service key is configured
  useEffect(() => {
    if (open) {
      fetch('/api/setup')
        .then((r) => r.json())
        .then((data) => setHasServiceKey(data.hasServiceKey ?? false))
        .catch(() => setHasServiceKey(false))
    }
  }, [open])

  async function handleSaveServiceKey() {
    if (!serviceKey.trim()) return
    setSavingKey(true)
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceRoleKey: serviceKey.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setNeedsRestart(true)
      } else {
        setError(data.error || 'Failed to save')
      }
    } catch {
      setError('Failed to save service key')
    } finally {
      setSavingKey(false)
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !workspace) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Get auth session for server-side verification
      const authClient = getSupabaseClient()
      const authSession = authClient ? (await authClient.auth.getSession()).data.session : null

      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authSession?.access_token ? { Authorization: `Bearer ${authSession.access_token}` } : {}),
        },
        body: JSON.stringify({
          email: email.trim(),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to invite')
        return
      }

      if (data.added) {
        setSuccess(`✅ ${data.displayName || email} has been added to ${workspace.name}!`)
      } else if (data.invited) {
        setSuccess(`📧 Invitation email sent to ${email.trim()}! They'll join ${workspace.name} when they accept.`)
      }

      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setLoading(false)
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Service key setup needed
  if (hasServiceKey === false && !needsRestart) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Setup email invitations</DialogTitle>
            <DialogDescription>
              To send invite emails, OpenHive needs your Supabase <strong>service_role key</strong>. This is stored server-side only and never exposed to the browser.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="service-key">Service Role Key</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="service-key"
                  type="password"
                  placeholder="eyJhbGci..."
                  value={serviceKey}
                  onChange={(e) => setServiceKey(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Supabase Dashboard → Settings → API → service_role (secret)
              </p>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSaveServiceKey} disabled={savingKey || !serviceKey.trim()}>
                {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save & Enable'}
              </Button>
            </div>

            <div className="border-t pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Or share the invite link manually:</p>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-xs text-muted-foreground truncate">
                  <Link2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{inviteLink}</span>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleCopyLink}>
                  {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Needs restart after saving service key
  if (needsRestart) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restart required</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
            <p className="text-sm text-muted-foreground">
              Service role key saved! Please restart your dev server (<code className="bg-muted px-1 py-0.5 rounded">Ctrl+C</code> then <code className="bg-muted px-1 py-0.5 rounded">npm run dev</code>) for the change to take effect.
            </p>
            <Button onClick={() => { setNeedsRestart(false); setHasServiceKey(true); onOpenChange(false) }}>
              I&apos;ve restarted
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Main invite dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite people to {workspace?.name}</DialogTitle>
          <DialogDescription>
            Send an email invitation or share the invite link.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleInvite} className="space-y-4 overflow-hidden">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email address</Label>
            <div className="flex gap-2 min-w-0">
              <div className="relative flex-1 min-w-0">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); setSuccess(null) }}
                  className="pl-9 w-full"
                />
              </div>
              <Button type="submit" disabled={loading || !email.trim()} className="shrink-0">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Send</>}
              </Button>
            </div>
          </div>

          {success && (
            <div className="flex items-start gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-md">
              <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="border-t pt-4 space-y-1">
            <div className="flex items-start gap-2 p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-md">
              <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Make sure your <strong>Supabase Site URL</strong> is set to your production domain (not localhost).
                Go to Supabase Dashboard → Authentication → URL Configuration.
              </p>
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <Label>Or share invite link</Label>
            <div className="flex gap-2 min-w-0">
              <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground">
                <Link2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{inviteLink}</span>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={handleCopyLink}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
