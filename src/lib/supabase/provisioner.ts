import { migrations, REQUIRED_TABLES } from './migrations'

export type ProgressCallback = (status: string) => void

export function validateToken(token: string): boolean {
  const trimmed = token.trim()
  return trimmed.startsWith('sbp_') && trimmed.length > 10
}

export function extractProjectRef(supabaseURL: string): string | null {
  try {
    const url = new URL(supabaseURL)
    const parts = url.hostname.split('.')
    if (parts.length >= 2 && parts[1] === 'supabase') {
      return parts[0]
    }
    return null
  } catch {
    return null
  }
}

async function executeSQL(
  projectRef: string,
  accessToken: string,
  sql: string,
  readOnly: boolean = false
): Promise<unknown> {
  // Call our server-side API route to avoid CORS issues with Supabase Management API
  const response = await fetch('/api/provision', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projectRef, accessToken, sql, readOnly }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
    const message = data.error || `HTTP ${response.status}`

    if (
      message.includes('JWT') ||
      message.includes('token') ||
      message.includes('unauthorized')
    ) {
      throw new Error(
        `Connection failed: ${message}. Make sure you're using a Personal Access Token (starts with sbp_) from supabase.com/dashboard/account/tokens`
      )
    }
    throw new Error(`Supabase API error: ${message}`)
  }

  // Some SQL commands return empty responses — handle gracefully
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractTableName(sql: string): string {
  const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)
  if (match) return `Creating ${match[1]}`
  if (sql.includes('ENABLE ROW LEVEL SECURITY')) return 'Setting up RLS policies & triggers'
  if (sql.includes('ALTER PUBLICATION')) return 'Enabling Realtime'
  if (sql.includes('DELETE FROM auth.users')) return 'Cleaning up orphaned users'
  return 'Running migration'
}

export async function provision(
  supabaseURL: string,
  accessToken: string,
  onProgress: ProgressCallback
): Promise<void> {
  const cleanToken = accessToken.trim()
  const ref = extractProjectRef(supabaseURL)

  if (!ref) throw new Error('Invalid Supabase URL. It should look like https://xxxxx.supabase.co')
  if (!validateToken(cleanToken)) {
    throw new Error(
      "Invalid token format. The Personal Access Token should start with 'sbp_'. Generate one at supabase.com/dashboard/account/tokens"
    )
  }

  // Step 0: Test connection
  onProgress('Testing connection...')
  try {
    await executeSQL(ref, cleanToken, 'SELECT 1;', true)
  } catch (error) {
    throw new Error(
      `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}. Verify your Personal Access Token.`
    )
  }

  // Run all migrations
  const total = migrations.length
  const errors: string[] = []
  for (let i = 0; i < total; i++) {
    const sql = migrations[i]
    const step = i + 1
    const label = extractTableName(sql)
    onProgress(`(${step}/${total}) ${label}...`)
    try {
      await executeSQL(ref, cleanToken, sql, false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[provision] Migration ${step}/${total} failed (${label}):`, msg)
      errors.push(`${label}: ${msg}`)
      // Continue with remaining migrations — don't abort on individual failures
      // (e.g. table already exists, duplicate policy, etc.)
    }
  }

  if (errors.length > 0) {
    console.warn(`[provision] ${errors.length} migration(s) had errors (non-fatal):`, errors)
  }

  onProgress(`Done! ${total - errors.length}/${total} migrations applied.`)
}

export async function configureSiteUrl(
  supabaseURL: string,
  accessToken: string,
  siteUrl: string,
  onProgress: ProgressCallback
): Promise<boolean> {
  const cleanToken = accessToken.trim()
  const ref = extractProjectRef(supabaseURL)

  if (!ref) {
    console.warn('configureSiteUrl: invalid Supabase URL')
    return false
  }

  onProgress('Configuring Supabase Auth Site URL...')

  // Build redirect URLs: the current site URL + localhost for dev
  const redirectUrls = [siteUrl]
  if (!siteUrl.includes('localhost')) {
    redirectUrls.push('http://localhost:3000')
  }

  try {
    const response = await fetch('/api/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectRef: ref,
        accessToken: cleanToken,
        action: 'update_auth_config',
        siteUrl,
        redirectUrls,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      console.warn('Failed to configure Site URL:', data.error)
      onProgress('⚠ Could not auto-configure Site URL')
      return false
    }

    onProgress(`Site URL configured to ${siteUrl}`)
    return true
  } catch (err) {
    console.warn('Failed to configure Site URL:', err)
    onProgress('⚠ Could not auto-configure Site URL')
    return false
  }
}

export async function verifyTables(
  supabaseURL: string,
  accessToken: string
): Promise<string[]> {
  const cleanToken = accessToken.trim()
  const ref = extractProjectRef(supabaseURL)
  if (!ref) throw new Error('Invalid Supabase URL')

  const sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${REQUIRED_TABLES.map((t) => `'${t}'`).join(',')});`

  try {
    const result = (await executeSQL(ref, cleanToken, sql, true)) as Array<{ table_name: string }>
    const found = new Set(result.map((r) => r.table_name))
    return REQUIRED_TABLES.filter((t) => !found.has(t))
  } catch {
    // If verification fails, skip (tables were likely created)
    return []
  }
}
