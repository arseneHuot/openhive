'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Clock, Calendar } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'

interface ScheduleMessageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: string
  channelId: string
  onScheduled: () => void
}

export function ScheduleMessageDialog({ open, onOpenChange, content, channelId, onScheduled }: ScheduleMessageDialogProps) {
  const { user, workspace } = useAppStore()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [scheduling, setScheduling] = useState(false)

  // Preset options
  const presets = [
    { label: 'In 30 minutes', getTime: () => new Date(Date.now() + 30 * 60 * 1000) },
    { label: 'In 1 hour', getTime: () => new Date(Date.now() + 60 * 60 * 1000) },
    { label: 'In 3 hours', getTime: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
    { label: 'Tomorrow 9 AM', getTime: () => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      return d
    }},
  ]

  async function handleSchedule(scheduledFor: Date) {
    const client = getSupabaseClient()
    if (!client || !user || !workspace) return

    setScheduling(true)
    try {
      await client.from('scheduled_messages').insert({
        user_id: user.id,
        channel_id: channelId,
        workspace_id: workspace.id,
        content,
        scheduled_for: scheduledFor.toISOString(),
      })
      onScheduled()
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to schedule message:', err)
    }
    setScheduling(false)
  }

  async function handleCustomSchedule() {
    if (!date || !time) return
    const scheduledFor = new Date(`${date}T${time}`)
    if (scheduledFor <= new Date()) {
      alert('Please select a future date and time')
      return
    }
    await handleSchedule(scheduledFor)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" style={{ color: '#7C5CFC' }} />
            Schedule Message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs font-medium" style={{ color: '#8E8EA0' }}>Quick options</p>
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleSchedule(preset.getTime())}
              disabled={scheduling}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-[#F5F2FF] transition-colors flex items-center gap-2"
              style={{ color: '#2D2B3D' }}
            >
              <Calendar className="h-3.5 w-3.5" style={{ color: '#7C5CFC' }} />
              {preset.label}
            </button>
          ))}
        </div>

        <div className="pt-2 border-t" style={{ borderColor: '#E5E1EE' }}>
          <p className="text-xs font-medium mb-2" style={{ color: '#8E8EA0' }}>Custom date & time</p>
          <div className="flex gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="flex-1"
            />
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-32"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleCustomSchedule}
            disabled={!date || !time || scheduling}
            style={{ background: '#7C5CFC', color: '#fff' }}
          >
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
