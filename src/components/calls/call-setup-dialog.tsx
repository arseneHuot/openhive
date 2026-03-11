'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Phone } from 'lucide-react'

interface CallSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CallSetupDialog({ open, onOpenChange }: CallSetupDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: '#EDE5FF' }}>
              <Phone className="h-5 w-5" style={{ color: '#7C5CFC' }} />
            </div>
            <AlertDialogTitle>Calls not enabled</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left">
            Video and audio calls require LiveKit to be configured. An admin needs to add LiveKit credentials in <strong>Workspace Settings &rarr; Calls</strong> to enable this feature.
            <br /><br />
            You can get free LiveKit credentials at{' '}
            <a href="https://cloud.livekit.io" target="_blank" rel="noopener noreferrer" className="text-[#7C5CFC] hover:underline">
              cloud.livekit.io
            </a>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction style={{ background: '#7C5CFC' }}>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
