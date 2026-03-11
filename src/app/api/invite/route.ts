import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { email, workspaceId, workspaceName } = await request.json()

    if (!email || !workspaceId) {
      return NextResponse.json({ error: 'Missing email or workspaceId' }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Service role key not configured. Add it in workspace settings.' },
        { status: 400 }
      )
    }

    // SECURITY: Verify caller is authenticated and is admin/owner of the workspace
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // Create admin client with service_role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Check that caller is admin/owner of the target workspace
    const { data: membership } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('profile_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only admins can invite members' }, { status: 403 })
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    )

    if (existingUser) {
      // User exists — add them to workspace directly
      // Check if already a member
      const { data: existing } = await supabaseAdmin
        .from('workspace_members')
        .select('profile_id')
        .eq('workspace_id', workspaceId)
        .eq('profile_id', existingUser.id)
        .limit(1)

      if (existing && existing.length > 0) {
        return NextResponse.json({ error: 'This person is already a member', alreadyMember: true }, { status: 400 })
      }

      // Add to workspace
      await supabaseAdmin.from('workspace_members').insert({
        workspace_id: workspaceId,
        profile_id: existingUser.id,
        role: 'member',
      })

      // Add to all public channels
      const { data: channels } = await supabaseAdmin
        .from('channels')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('is_private', false)

      if (channels) {
        for (const ch of channels) {
          await supabaseAdmin
            .from('channel_members')
            .insert({ channel_id: ch.id, profile_id: existingUser.id })
            .then(() => {})
        }
      }

      const displayName = existingUser.user_metadata?.display_name || email
      return NextResponse.json({ success: true, added: true, displayName })
    }

    // User doesn't exist — send invite email via Supabase Auth
    const redirectTo = `${request.nextUrl.origin}/auth?workspace=${workspaceId}&email=${encodeURIComponent(email)}`

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        workspace_id: workspaceId,
        workspace_name: workspaceName || 'OpenHive',
        display_name: email.split('@')[0],
      },
    })

    if (error) {
      // Handle "already invited" case
      if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
        return NextResponse.json({
          error: 'This email has already been invited. They should check their inbox.',
          alreadyInvited: true,
        }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({
      success: true,
      invited: true,
      message: `Invitation email sent to ${email}`,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send invite' },
      { status: 500 }
    )
  }
}
