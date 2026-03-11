import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Allowed MIME types for uploads
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Documents
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Archives
  'application/zip', 'application/gzip',
  // Audio/Video
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'video/webm',
  // Code
  'application/json', 'application/xml', 'text/html', 'text/css', 'text/javascript',
])

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
const MAX_AVATAR_SIZE = 5 * 1024 * 1024 // 5 MB

// POST: Upload a file to Supabase Storage using the service role key
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey || !anonKey) {
    return NextResponse.json(
      { error: 'Server not configured with service role key' },
      { status: 500 }
    )
  }

  // SECURITY: Verify caller is authenticated
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAuth = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const bucket = (formData.get('bucket') as string) || 'attachments'
    const path = formData.get('path') as string

    if (!file || !path) {
      return NextResponse.json(
        { error: 'Missing file or path' },
        { status: 400 }
      )
    }

    // Validate bucket name
    if (!['avatars', 'attachments'].includes(bucket)) {
      return NextResponse.json(
        { error: 'Invalid bucket name' },
        { status: 400 }
      )
    }

    // SECURITY: Validate file size
    const maxSize = bucket === 'avatars' ? MAX_AVATAR_SIZE : MAX_FILE_SIZE
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${maxSize / 1024 / 1024} MB` },
        { status: 400 }
      )
    }

    // SECURITY: Validate MIME type
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `File type "${file.type}" is not allowed` },
        { status: 400 }
      )
    }

    // SECURITY: Sanitize path — prevent directory traversal
    const sanitizedPath = path.replace(/\.\./g, '').replace(/\/\//g, '/')
    if (sanitizedPath !== path || path.includes('..')) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      )
    }

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(sanitizedPath, buffer, {
        upsert: true,
        contentType: file.type,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      )
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(sanitizedPath)

    return NextResponse.json({
      success: true,
      publicUrl: urlData.publicUrl,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
