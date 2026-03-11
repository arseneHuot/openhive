'use client'

import { useState, useRef, useEffect } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'

interface ProfileEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileEditDialog({ open, onOpenChange }: ProfileEditDialogProps) {
  const { user, setUser } = useAppStore()
  const [displayName, setDisplayName] = useState('')
  const [statusEmoji, setStatusEmoji] = useState('')
  const [statusText, setStatusText] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load current user data when dialog opens
  useEffect(() => {
    if (open && user) {
      setDisplayName(user.display_name || '')
      setStatusEmoji(user.status_emoji || '')
      setStatusText(user.status_text || '')
      setAvatarUrl(user.avatar_url)
      setAvatarPreview(user.avatar_url)
      setError('')
    }
  }, [open, user])

  /**
   * Resize and compress an image file to max 500x500, output as JPEG.
   */
  function compressImage(file: File, maxSize: number = 500, quality: number = 0.85): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        let { width, height } = img

        // Scale down to fit within maxSize x maxSize, keeping aspect ratio
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height / width) * maxSize)
            width = maxSize
          } else {
            width = Math.round((width / height) * maxSize)
            height = maxSize
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas not supported')); return }
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('Compression failed'))
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
      img.src = url
    })
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Accept up to 20MB raw — we'll compress it down
    if (file.size > 20 * 1024 * 1024) {
      setError('Image must be less than 20MB')
      return
    }

    setError('')
    setUploading(true)

    try {
      // Compress and resize to max 500x500 JPEG
      const compressed = await compressImage(file, 500, 0.85)

      // Create a preview from the compressed blob
      const previewUrl = URL.createObjectURL(compressed)
      setAvatarPreview(previewUrl)

      // Upload via server-side API route (bypasses RLS)
      const path = `${user.id}.jpg`

      const formData = new FormData()
      formData.append('file', new File([compressed], `${user.id}.jpg`, { type: 'image/jpeg' }))
      formData.append('bucket', 'avatars')
      formData.append('path', path)

      // Include auth header for server-side verification
      const authClient = getSupabaseClient()
      const authSession = authClient ? (await authClient.auth.getSession()).data.session : null
      const uploadHeaders: Record<string, string> = {}
      if (authSession?.access_token) {
        uploadHeaders.Authorization = `Bearer ${authSession.access_token}`
      }

      const res = await fetch('/api/upload', { method: 'POST', body: formData, headers: uploadHeaders })
      const data = await res.json()

      if (!res.ok || !data.publicUrl) {
        throw new Error(data.error || 'Upload failed')
      }

      // Add cache-busting param
      const newUrl = `${data.publicUrl}?t=${Date.now()}`
      setAvatarUrl(newUrl)
    } catch (err) {
      console.error('Upload failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload image.')
      setAvatarPreview(avatarUrl) // Revert preview
    } finally {
      setUploading(false)
    }
  }

  function handleRemoveAvatar() {
    setAvatarUrl(null)
    setAvatarPreview(null)
  }

  async function handleSave() {
    if (!user || !displayName.trim()) {
      setError('Display name is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      const client = getSupabaseClient()
      if (!client) throw new Error('Not connected')

      // Update profile in database
      const { error: updateError } = await client
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          status_emoji: statusEmoji || null,
          status_text: statusText.trim() || null,
          avatar_url: avatarUrl,
        })
        .eq('id', user.id)

      if (updateError) throw updateError

      // Update auth metadata
      await client.auth.updateUser({
        data: { display_name: displayName.trim() },
      })

      // Update local store
      setUser({
        ...user,
        display_name: displayName.trim(),
        status_emoji: statusEmoji || null,
        status_text: statusText.trim() || null,
        avatar_url: avatarUrl,
      })

      onOpenChange(false)
    } catch (err) {
      console.error('Failed to save profile:', err)
      setError('Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const initial = (displayName || user?.display_name || '?')[0]?.toUpperCase()

  // Common status emojis
  const statusEmojis = ['😊', '🏠', '🎯', '🚀', '💤', '🏖️', '🤒', '📅', '🎉', '🔇']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your profile information and photo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Avatar */}
          <div className="flex flex-col items-center">
            <div className="relative group">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="h-24 w-24 rounded-2xl object-cover shadow-sm"
                />
              ) : (
                <div className="h-24 w-24 rounded-2xl flex items-center justify-center text-3xl font-bold text-white" style={{ background: '#7C5CFC' }}>
                  {initial}
                </div>
              )}

              {/* Upload overlay */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </button>

              {/* Remove button */}
              {avatarPreview && (
                <button
                  onClick={handleRemoveAvatar}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: '#E55B5B' }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-2 text-xs hover:underline"
              style={{ color: '#7C5CFC' }}
            >
              {uploading ? 'Uploading...' : 'Change photo'}
            </button>
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={50}
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="flex gap-2">
              <div className="relative">
                <Input
                  value={statusEmoji}
                  onChange={(e) => setStatusEmoji(e.target.value)}
                  placeholder="😊"
                  className="w-14 text-center text-lg"
                  maxLength={2}
                />
              </div>
              <Input
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="What's your status?"
                className="flex-1"
                maxLength={100}
              />
            </div>
            {/* Quick emoji picks */}
            <div className="flex gap-1 pt-1">
              {statusEmojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setStatusEmoji(emoji)}
                  className={`h-7 w-7 rounded-lg flex items-center justify-center text-sm transition-all ${
                    statusEmoji === emoji ? 'bg-[#EDE5FF] ring-1 ring-[#7C5CFC]/30' : 'hover:bg-[#F5F2FF]'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm" style={{ color: '#E55B5B' }}>{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || uploading} style={{ background: '#7C5CFC', color: '#fff' }}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
