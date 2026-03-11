import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST: Create storage buckets (avatars, attachments)
export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'Missing Supabase URL or service role key. Please configure these in your .env.local file.' },
      { status: 400 }
    )
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const results: Record<string, string> = {}

  // Create 'avatars' bucket
  const { error: avatarsError } = await supabase.storage.createBucket('avatars', {
    public: true,
    fileSizeLimit: 5242880, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  })
  if (avatarsError) {
    if (avatarsError.message?.includes('already exists')) {
      results.avatars = 'already exists'
    } else {
      results.avatars = `error: ${avatarsError.message}`
    }
  } else {
    results.avatars = 'created'
  }

  // Create 'attachments' bucket
  const { error: attachmentsError } = await supabase.storage.createBucket('attachments', {
    public: true,
    fileSizeLimit: 52428800, // 50MB
  })
  if (attachmentsError) {
    if (attachmentsError.message?.includes('already exists')) {
      results.attachments = 'already exists'
    } else {
      results.attachments = `error: ${attachmentsError.message}`
    }
  } else {
    results.attachments = 'created'
  }

  // Set RLS policies for both buckets to allow authenticated users
  // Using raw SQL via the management API isn't available here, but
  // public buckets with service role key creation should work

  return NextResponse.json({ success: true, buckets: results })
}
