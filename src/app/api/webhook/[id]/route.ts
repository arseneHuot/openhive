import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    // Use service key if available, otherwise anon key
    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // Look up the incoming webhook
    const { data: webhook, error: webhookError } = await supabase
      .from('incoming_webhooks')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single()

    if (webhookError || !webhook) {
      return NextResponse.json({ error: 'Webhook not found or inactive' }, { status: 404 })
    }

    // Parse the request body
    const body = await request.json()
    const { text, username, icon_url } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid "text" field in request body' }, { status: 400 })
    }

    // SECURITY: Limit text length to prevent abuse
    if (text.length > 4000) {
      return NextResponse.json({ error: 'Text exceeds maximum length of 4000 characters' }, { status: 400 })
    }

    // Sanitize username (if provided) — strip HTML tags
    const sanitizedUsername = typeof username === 'string'
      ? username.replace(/<[^>]*>/g, '').slice(0, 100)
      : undefined

    // Build message content
    const displayName = sanitizedUsername || webhook.display_name || webhook.name
    const prefix = `**[${displayName}]** `
    const content = prefix + text

    // Insert message into the webhook's configured channel
    const { error: msgError } = await supabase.from('messages').insert({
      channel_id: webhook.channel_id,
      sender_id: webhook.created_by, // Use the webhook creator as sender
      content,
      metadata: {
        webhook_id: webhook.id,
        webhook_name: webhook.name,
        display_name: displayName,
        icon_url: icon_url || webhook.avatar_url,
      },
    })

    if (msgError) {
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
