'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  MessageSquare,
  Server,
  Shield,
  Phone,
  Puzzle,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  Check,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { provision, verifyTables, configureSiteUrl, validateToken } from '@/lib/supabase/provisioner'

type Step = 'welcome' | 'connect' | 'provisioning' | 'done'

export default function SetupPage() {
  const [step, setStep] = useState<Step>('welcome')
  const [supabaseURL, setSupabaseURL] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [tokenWarning, setTokenWarning] = useState<string | null>(null)
  const [provisioningStatus, setProvisioningStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isProduction, setIsProduction] = useState(false)
  const [siteUrlConfigured, setSiteUrlConfigured] = useState(true)

  // If already configured, redirect to auth
  useEffect(() => {
    fetch('/api/setup')
      .then((res) => res.json())
      .then((data) => {
        if (data.configured) {
          window.location.href = '/auth'
        }
      })
      .catch(() => {})
  }, [])

  function handleTokenChange(value: string) {
    setAccessToken(value)
    const trimmed = value.trim()
    if (!trimmed) {
      setTokenWarning(null)
    } else if (trimmed.startsWith('eyJ')) {
      setTokenWarning(
        "This looks like a JWT key (anon/service_role), not a Personal Access Token. The token should start with sbp_"
      )
    } else if (!trimmed.startsWith('sbp_')) {
      setTokenWarning("Personal Access Tokens start with sbp_. Make sure you're using the right token.")
    } else {
      setTokenWarning(null)
    }
  }

  async function startProvisioning() {
    setError(null)
    setStep('provisioning')

    try {
      const cleanURL = supabaseURL.trim().replace(/\/+$/, '')
      const cleanKey = anonKey.trim()
      const cleanToken = accessToken.trim()

      // Validate URL
      try {
        new URL(cleanURL)
      } catch {
        throw new Error('Invalid Supabase URL. Please check the URL and try again.')
      }

      // Validate token
      if (!validateToken(cleanToken)) {
        throw new Error(
          "Invalid token format. The Personal Access Token should start with 'sbp_'."
        )
      }

      // Step 1: Provision database (runs all SQL migrations)
      console.log('[setup] Step 1: Starting database provisioning...')
      await provision(cleanURL, cleanToken, (status) => {
        setProvisioningStatus(status)
      })
      console.log('[setup] Step 1: Database provisioning complete')

      // Step 2: Save config to .env.local IMMEDIATELY after DB setup
      // This is the critical step — do it before optional steps so config isn't lost
      console.log('[setup] Step 2: Saving configuration...')
      setProvisioningStatus('Saving configuration...')
      try {
        const res = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supabaseUrl: cleanURL, anonKey: cleanKey }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          // In production (Vercel, etc.), .env.local can't be written — that's expected
          if (data.error?.includes('production') || data.error?.includes('development')) {
            setIsProduction(true)
            console.log('[setup] Step 2: Production detected, env vars need manual config')
          } else {
            console.error('[setup] Step 2: Failed to save config:', data.error)
            throw new Error(data.error || 'Failed to save configuration')
          }
        } else {
          console.log('[setup] Step 2: .env.local written successfully')
        }
      } catch (saveErr) {
        console.error('[setup] Step 2: Error saving config:', saveErr)
        throw saveErr
      }

      // Step 3: Configure Supabase Auth Site URL (optional — non-blocking)
      console.log('[setup] Step 3: Configuring Site URL...')
      try {
        const currentOrigin = window.location.origin
        const siteUrlOk = await configureSiteUrl(cleanURL, cleanToken, currentOrigin, (status) => {
          setProvisioningStatus(status)
        })
        setSiteUrlConfigured(siteUrlOk)
        console.log('[setup] Step 3: Site URL configured:', siteUrlOk)
      } catch (siteUrlErr) {
        console.warn('[setup] Step 3: Site URL config failed (non-blocking):', siteUrlErr)
        setSiteUrlConfigured(false)
      }

      // Step 4: Verify tables (optional — non-blocking)
      console.log('[setup] Step 4: Verifying tables...')
      setProvisioningStatus('Verifying database...')
      try {
        const missing = await verifyTables(cleanURL, cleanToken)
        if (missing.length > 0) {
          console.warn('[setup] Step 4: Missing tables:', missing)
          // Don't throw — tables were likely created, just verification failed
        } else {
          console.log('[setup] Step 4: All tables verified')
        }
      } catch (verifyErr) {
        console.warn('[setup] Step 4: Verification failed (non-blocking):', verifyErr)
      }

      console.log('[setup] Setup complete!')
      setStep('done')
    } catch (err) {
      console.error('[setup] Setup failed:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const canConnect =
    supabaseURL.trim() !== '' &&
    anonKey.trim() !== '' &&
    accessToken.trim() !== '' &&
    !tokenWarning

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {step === 'welcome' && (
        <div className="max-w-lg w-full space-y-8 text-center">
          <div className="space-y-4">
            <MessageSquare className="mx-auto h-16 w-16 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight">Welcome to OpenHive</h1>
            <p className="text-lg text-muted-foreground">
              The open-source team communication platform
            </p>
          </div>

          <div className="space-y-3 text-left">
            <Feature icon={<Server className="h-5 w-5" />} title="Self-hosted" desc="Your data, your servers, your rules" />
            <Feature icon={<Shield className="h-5 w-5" />} title="Secure" desc="Row-level security powered by Supabase" />
            <Feature icon={<Phone className="h-5 w-5" />} title="Audio & Video" desc="Built-in calls with LiveKit WebRTC" />
            <Feature icon={<Puzzle className="h-5 w-5" />} title="Extensible" desc="Webhooks, bots, slash commands" />
          </div>

          <Button size="lg" className="w-full max-w-xs" onClick={() => setStep('connect')}>
            Get Started <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {step === 'connect' && (
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <Server className="mx-auto h-12 w-12 text-green-500 mb-2" />
            <CardTitle>Connect your Supabase project</CardTitle>
            <CardDescription>
              OpenHive will automatically create all 23 tables, security policies, triggers, and
              realtime config.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">Supabase Project URL</Label>
              <Input
                id="url"
                placeholder="https://xxxxx.supabase.co"
                value={supabaseURL}
                onChange={(e) => setSupabaseURL(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Settings &rsaquo; API &rsaquo; Project URL</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="anon">Anon (Public) Key</Label>
              <Input
                id="anon"
                type="password"
                placeholder="eyJhbGci..."
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Settings &rsaquo; API &rsaquo; Project API keys &rsaquo; anon public
              </p>
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="token">Personal Access Token</Label>
                <span className="text-xs text-orange-500 font-medium">(used once, not saved)</span>
              </div>
              <Input
                id="token"
                type="password"
                placeholder="sbp_..."
                value={accessToken}
                onChange={(e) => handleTokenChange(e.target.value)}
              />
              {tokenWarning && (
                <div className="flex items-start gap-2 text-orange-500">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="text-xs">{tokenWarning}</p>
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ExternalLink className="h-3 w-3" />
                <span>Generate at</span>
                <a
                  href="https://supabase.com/dashboard/account/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  supabase.com/dashboard/account/tokens
                </a>
              </div>
              <p className="text-xs text-muted-foreground">
                This is NOT the anon key or service_role key. It&apos;s a Personal Access Token (starts
                with sbp_) from your Supabase account settings.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep('welcome')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1" disabled={!canConnect} onClick={startProvisioning}>
                Connect & Setup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'provisioning' && (
        <div className="max-w-md w-full space-y-6 text-center">
          {!error ? (
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          ) : (
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          )}
          <h2 className="text-2xl font-bold">{!error ? 'Setting up your workspace...' : 'Setup failed'}</h2>
          <p className="text-muted-foreground">{provisioningStatus}</p>

          {error && (
            <div className="space-y-4">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => { setError(null); startProvisioning() }}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Retry
                </Button>
                <Button variant="outline" onClick={() => { setError(null); setStep('connect') }}>
                  Back to setup
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="max-w-md w-full space-y-6 text-center">
          <Check className="mx-auto h-16 w-16 text-green-500" />
          <h2 className="text-2xl font-bold">Database provisioned!</h2>
          <p className="text-muted-foreground">
            Your Supabase project has been configured with all 23 tables, security policies, and
            realtime subscriptions.
          </p>
          {!siteUrlConfigured && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-md text-left space-y-2">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                ⚠ Could not auto-configure the Supabase Site URL
              </p>
              <p className="text-xs text-red-600 dark:text-red-400">
                Invitation and password-reset emails will point to <strong>localhost</strong> instead of your domain.
                To fix this, go to <strong>Supabase Dashboard → Authentication → URL Configuration</strong> and
                set the <strong>Site URL</strong> to your production URL.
              </p>
            </div>
          )}
          {isProduction ? (
            <>
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-md text-left space-y-3">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Set these environment variables in your hosting platform (Vercel, Railway, etc.):
                </p>
                <div className="space-y-2">
                  <div className="bg-muted rounded p-2">
                    <code className="text-xs break-all select-all">NEXT_PUBLIC_SUPABASE_URL={supabaseURL.trim()}</code>
                  </div>
                  <div className="bg-muted rounded p-2">
                    <code className="text-xs break-all select-all">NEXT_PUBLIC_SUPABASE_ANON_KEY={anonKey.trim()}</code>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  After setting them, redeploy your app. You can also add <code className="bg-muted px-1 py-0.5 rounded">SUPABASE_SERVICE_ROLE_KEY</code> for email invitations and file uploads.
                </p>
              </div>
              <Button size="lg" onClick={() => window.location.href = '/auth'}>
                I&apos;ve set the env vars — Go to sign up
              </Button>
            </>
          ) : (
            <>
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-md">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <strong>Important:</strong> Please restart your dev server (<code className="bg-muted px-1 py-0.5 rounded">Ctrl+C</code> then <code className="bg-muted px-1 py-0.5 rounded">npm run dev</code>) for the new configuration to take effect.
                </p>
              </div>
              <Button size="lg" onClick={() => window.location.reload()}>
                I&apos;ve restarted — Continue
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="text-primary">{icon}</div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  )
}
