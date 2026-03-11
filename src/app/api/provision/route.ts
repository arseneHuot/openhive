import { NextRequest, NextResponse } from 'next/server'

function validatePAT(token: string): string | null {
  const trimmed = token.trim()
  if (!trimmed.startsWith('sbp_') || trimmed.length < 10) {
    return "Invalid token format. Personal Access Token should start with 'sbp_'"
  }
  return null
}

export async function POST(req: NextRequest) {
  // NOTE: This endpoint requires a valid Supabase Personal Access Token (sbp_...)
  // which already grants full admin access to the project — so no additional
  // production guard is needed. The PAT itself is the security boundary.

  try {
    const body = await req.json()
    const { projectRef, accessToken } = body

    // Validate common fields
    if (!projectRef || !accessToken) {
      return NextResponse.json(
        { error: 'Missing required fields: projectRef, accessToken' },
        { status: 400 }
      )
    }

    const trimmedToken = accessToken.trim()
    const tokenError = validatePAT(trimmedToken)
    if (tokenError) {
      return NextResponse.json({ error: tokenError }, { status: 400 })
    }

    // Route to the right handler based on action type
    if (body.action === 'update_auth_config') {
      return handleAuthConfig(projectRef, trimmedToken, body)
    }

    // Default: SQL query execution
    return handleSQL(projectRef, trimmedToken, body)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function handleSQL(
  projectRef: string,
  accessToken: string,
  body: { sql?: string; readOnly?: boolean }
) {
  const { sql, readOnly } = body

  if (!sql) {
    return NextResponse.json({ error: 'Missing required field: sql' }, { status: 400 })
  }

  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql, read_only: readOnly ?? false }),
  })

  if (!response.ok) {
    const responseBody = await response.text()
    try {
      const json = JSON.parse(responseBody)
      const message = json.message || json.error || responseBody
      return NextResponse.json({ error: message }, { status: response.status })
    } catch {
      return NextResponse.json(
        { error: `Supabase API error (HTTP ${response.status}): ${responseBody}` },
        { status: response.status }
      )
    }
  }

  // Some SQL commands (DDL) may return empty or non-JSON responses
  const responseBody = await response.text()
  if (!responseBody) {
    return NextResponse.json([])
  }
  try {
    const data = JSON.parse(responseBody)
    return NextResponse.json(data)
  } catch {
    // Non-JSON success response (e.g. plain text from DDL)
    return NextResponse.json({ result: responseBody })
  }
}

async function handleAuthConfig(
  projectRef: string,
  accessToken: string,
  body: { siteUrl?: string; redirectUrls?: string[] }
) {
  const { siteUrl, redirectUrls } = body

  if (!siteUrl) {
    return NextResponse.json({ error: 'Missing required field: siteUrl' }, { status: 400 })
  }

  // Validate URL format
  try {
    new URL(siteUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid siteUrl format' }, { status: 400 })
  }

  console.log(`[auth-config] Updating Site URL to: ${siteUrl}`)

  // First, GET current auth config to preserve existing redirect URLs
  const getUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`
  const getResponse = await fetch(getUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  let existingRedirectUrls: string[] = []
  if (getResponse.ok) {
    const currentConfig = await getResponse.json()
    // uri_allowlist is a comma-separated string in Supabase API
    if (currentConfig.URI_ALLOW_LIST) {
      existingRedirectUrls = currentConfig.URI_ALLOW_LIST
        .split(',')
        .map((u: string) => u.trim())
        .filter(Boolean)
    }
    console.log(`[auth-config] Current Site URL: ${currentConfig.SITE_URL}`)
    console.log(`[auth-config] Current Redirect URLs: ${currentConfig.URI_ALLOW_LIST || '(none)'}`)
  } else {
    console.warn(`[auth-config] Failed to GET current config: HTTP ${getResponse.status}`)
  }

  // Merge new redirect URLs with existing ones (deduplicate)
  const allRedirectUrls = [...new Set([...existingRedirectUrls, ...(redirectUrls || [])])]

  // Update auth config via Supabase Management API
  const updateUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`
  const updateBody: Record<string, unknown> = {
    SITE_URL: siteUrl,
  }

  if (allRedirectUrls.length > 0) {
    updateBody.URI_ALLOW_LIST = allRedirectUrls.join(',')
  }

  console.log(`[auth-config] PATCH body:`, JSON.stringify(updateBody))

  const response = await fetch(updateUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updateBody),
  })

  if (!response.ok) {
    const responseBody = await response.text()
    console.error(`[auth-config] PATCH failed: HTTP ${response.status}`, responseBody)
    try {
      const json = JSON.parse(responseBody)
      const message = json.message || json.error || responseBody
      return NextResponse.json({ error: message }, { status: response.status })
    } catch {
      return NextResponse.json(
        { error: `Supabase API error (HTTP ${response.status}): ${responseBody}` },
        { status: response.status }
      )
    }
  }

  const data = await response.json()
  console.log(`[auth-config] ✅ Site URL updated to: ${siteUrl}`)
  return NextResponse.json({ success: true, siteUrl, redirectUrls: allRedirectUrls, data })
}
