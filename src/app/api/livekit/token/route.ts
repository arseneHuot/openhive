import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AccessToken } from 'livekit-server-sdk'

export async function POST(request: NextRequest) {
  try {
    const { roomName, workspaceId, identity, displayName } = await request.json()

    if (!roomName || !workspaceId || !identity || !displayName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    // Use the user's auth token to verify identity
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    })

    // Verify user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // Look up workspace settings for LiveKit credentials
    const { data: settings, error: settingsError } = await supabase
      .from('workspace_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .single()

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: 'LiveKit not configured. Set up LiveKit in workspace settings.' },
        { status: 400 }
      )
    }

    if (!settings.calls_enabled) {
      return NextResponse.json({ error: 'Calls are disabled for this workspace' }, { status: 400 })
    }

    if (!settings.livekit_url || !settings.livekit_api_key || !settings.livekit_api_secret) {
      return NextResponse.json(
        { error: 'LiveKit credentials not configured. Add them in workspace settings.' },
        { status: 400 }
      )
    }

    // SECURITY: Use verified user.id as identity (not client-supplied value)
    // This prevents identity spoofing — the client can suggest a displayName
    // but the identity is always the authenticated user's ID
    const token = new AccessToken(settings.livekit_api_key, settings.livekit_api_secret, {
      identity: user.id,
      name: displayName,
    })

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    })

    const jwt = await token.toJwt()

    return NextResponse.json({
      token: jwt,
      url: settings.livekit_url,
    })
  } catch (error) {
    console.error('LiveKit token error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate token' },
      { status: 500 }
    )
  }
}
