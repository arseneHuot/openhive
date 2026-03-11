import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/invite/complete
 * Fallback for completing the invite flow when hash fragment session doesn't work.
 * Uses admin API to create/update the user and add them to the workspace.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, displayName, workspaceId } = await request.json()

    if (!email || !password || !workspaceId) {
      return NextResponse.json(
        { error: 'Missing email, password, or workspaceId' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Service role key not configured. Ask your workspace admin to set SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let userId: string | null = null

    // Strategy 1: Try to create the user directly (works if invite user doesn't exist yet)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName || email.split('@')[0],
        workspace_id: workspaceId,
      },
    })

    if (newUser?.user) {
      userId = newUser.user.id
    } else if (createError) {
      // User already exists (from inviteUserByEmail) — find and update them
      console.log('[invite-complete] User exists, looking up to update:', createError.message)

      // Find user by listing (with error handling)
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })

      if (listError) {
        console.error('[invite-complete] listUsers failed:', listError)
        return NextResponse.json(
          { error: `Admin API error: ${listError.message}. Check SUPABASE_SERVICE_ROLE_KEY.` },
          { status: 500 }
        )
      }

      const existingUser = usersData?.users.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      )

      if (!existingUser) {
        return NextResponse.json(
          { error: 'Could not find user account. Please try again or contact workspace admin.' },
          { status: 404 }
        )
      }

      // Update password and metadata
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        {
          password,
          email_confirm: true,
          user_metadata: {
            ...existingUser.user_metadata,
            display_name: displayName || email.split('@')[0],
          },
        }
      )

      if (updateError) {
        console.error('[invite-complete] updateUser failed:', updateError)
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        )
      }

      userId = existingUser.id
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Failed to create or find user' },
        { status: 500 }
      )
    }

    // Update profile table
    await supabaseAdmin
      .from('profiles')
      .update({ display_name: displayName || email.split('@')[0] })
      .eq('id', userId)

    // Add to workspace if not already a member
    const { data: existing } = await supabaseAdmin
      .from('workspace_members')
      .select('profile_id')
      .eq('workspace_id', workspaceId)
      .eq('profile_id', userId)
      .limit(1)

    if (!existing || existing.length === 0) {
      await supabaseAdmin.from('workspace_members').insert({
        workspace_id: workspaceId,
        profile_id: userId,
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
            .insert({ channel_id: ch.id, profile_id: userId })
            .then(() => {})
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[invite-complete] Unexpected error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to complete invite' },
      { status: 500 }
    )
  }
}
