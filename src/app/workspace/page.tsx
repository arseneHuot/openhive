'use client'

import { useAppStore } from '@/lib/store/app-store'
import { ChannelView } from '@/components/chat/channel-view'
import { Hash } from 'lucide-react'

export default function WorkspacePage() {
  const { channels, dmChannels, currentChannelId, previewChannel } = useAppStore()

  // Preview mode: viewing a channel the user hasn't joined yet
  if (previewChannel) {
    return <ChannelView channel={previewChannel} isPreview />
  }

  const currentChannel =
    channels.find((c) => c.id === currentChannelId) ||
    dmChannels.find((c) => c.id === currentChannelId)

  if (!currentChannel) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <Hash className="mx-auto h-12 w-12 opacity-30" />
          <p>Select a channel to start chatting</p>
        </div>
      </div>
    )
  }

  return <ChannelView channel={currentChannel} />
}
