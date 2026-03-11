'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LiveKitRoom,
  VideoTrack,
  AudioTrack,
  useParticipants,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  isTrackReference,
  type TrackReference,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useAppStore } from '@/lib/store/app-store'
import { getSupabaseClient } from '@/lib/supabase/client'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Maximize2,
  Minimize2,
  Users,
  Loader2,
} from 'lucide-react'
import type { ActiveCall, CallParticipant } from '@/types/database'

export function CallPanel() {
  const {
    user,
    workspace,
    activeCall,
    callToken,
    callUrl,
    isInCall,
    leaveCall,
    channels,
  } = useAppStore()

  if (!isInCall || !activeCall || !callToken || !callUrl) {
    return null
  }

  const channelName = channels.find((c) => c.id === activeCall.channel_id)?.name || 'Unknown'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <LiveKitRoom
        serverUrl={callUrl}
        token={callToken}
        connect={true}
        audio={true}
        video={false}
        onDisconnected={() => {
          leaveCall()
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <CallContent channelName={channelName} />
      </LiveKitRoom>
    </div>
  )
}

function CallContent({ channelName }: { channelName: string }) {
  const { user, activeCall, leaveCall } = useAppStore()
  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()
  const room = useRoomContext()
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Microphone, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )

  // Update participant state in Supabase
  const updateParticipantState = useCallback(async () => {
    const client = getSupabaseClient()
    if (!client || !user || !activeCall) return

    try {
      await client
        .from('call_participants')
        .update({
          is_muted: isMuted,
          is_camera_on: isCameraOn,
          is_sharing_screen: isScreenSharing,
        })
        .eq('call_id', activeCall.id)
        .eq('profile_id', user.id)
    } catch {
      // ignore
    }
  }, [isMuted, isCameraOn, isScreenSharing, user, activeCall])

  useEffect(() => {
    updateParticipantState()
  }, [updateParticipantState])

  async function toggleMute() {
    try {
      await localParticipant.setMicrophoneEnabled(isMuted)
      setIsMuted(!isMuted)
    } catch (err) {
      console.error('Failed to toggle mute:', err)
    }
  }

  async function toggleCamera() {
    try {
      await localParticipant.setCameraEnabled(!isCameraOn)
      setIsCameraOn(!isCameraOn)
    } catch (err) {
      console.error('Failed to toggle camera:', err)
    }
  }

  async function toggleScreenShare() {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenSharing)
      setIsScreenSharing(!isScreenSharing)
    } catch (err) {
      console.error('Failed to toggle screen share:', err)
    }
  }

  async function handleLeave() {
    const client = getSupabaseClient()
    if (client && user && activeCall) {
      // Mark participant as left
      await client
        .from('call_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('call_id', activeCall.id)
        .eq('profile_id', user.id)

      // If last participant, end the call
      const { data: remaining } = await client
        .from('call_participants')
        .select('profile_id')
        .eq('call_id', activeCall.id)
        .is('left_at', null)

      if (!remaining || remaining.length <= 1) {
        await client
          .from('active_calls')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', activeCall.id)
      }
    }

    room.disconnect()
    leaveCall()
  }

  const videoTracks = tracks.filter(
    (t): t is TrackReference => t.source === Track.Source.Camera && isTrackReference(t)
  )
  const screenTracks = tracks.filter(
    (t): t is TrackReference => t.source === Track.Source.ScreenShare && isTrackReference(t)
  )
  const audioTracks = tracks.filter(
    (t): t is TrackReference => t.source === Track.Source.Microphone && isTrackReference(t)
  )

  if (!isExpanded) {
    // Minimized bar at bottom
    return (
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
        style={{ background: '#2D2B3D' }}
      >
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: '#4ADE80' }} />
          <span className="text-white text-sm font-medium">#{channelName}</span>
          <span className="text-sm" style={{ color: '#8E8EA0' }}>
            <Users className="h-3 w-3 inline mr-1" />
            {participants.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleMute}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: isMuted ? '#E55B5B' : 'rgba(255,255,255,0.1)' }}
          >
            {isMuted ? (
              <MicOff className="h-4 w-4 text-white" />
            ) : (
              <Mic className="h-4 w-4 text-white" />
            )}
          </button>
          <button
            onClick={toggleCamera}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: isCameraOn ? '#7C5CFC' : 'rgba(255,255,255,0.1)' }}
          >
            {isCameraOn ? (
              <Video className="h-4 w-4 text-white" />
            ) : (
              <VideoOff className="h-4 w-4 text-white" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded(true)}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
          >
            <Maximize2 className="h-4 w-4 text-white" />
          </button>
          <button
            onClick={handleLeave}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: '#E55B5B' }}
          >
            <PhoneOff className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full animate-pulse" style={{ background: '#4ADE80' }} />
          <span className="text-white font-semibold text-lg">#{channelName}</span>
          <span className="text-sm flex items-center gap-1" style={{ color: '#8E8EA0' }}>
            <Users className="h-3.5 w-3.5" />
            {participants.length} participant{participants.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
        >
          <Minimize2 className="h-4 w-4 text-white" />
        </button>
      </div>

      {/* Video grid */}
      <div className="flex-1 px-6 pb-4 overflow-hidden">
        <div className={`h-full grid gap-3 ${
          participants.length <= 1
            ? 'grid-cols-1'
            : participants.length <= 4
              ? 'grid-cols-2'
              : 'grid-cols-3'
        }`}>
          {/* Screen share takes priority */}
          {screenTracks.map((track) => (
            <div
              key={track.participant.sid + '-screen'}
              className="relative rounded-2xl overflow-hidden col-span-full"
              style={{ background: '#1a1a2e', aspectRatio: '16/9' }}
            >
              <VideoTrack
                trackRef={track}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
              <div className="absolute bottom-3 left-3 px-2 py-1 rounded-lg text-xs text-white font-medium flex items-center gap-1.5" style={{ background: 'rgba(0,0,0,0.6)' }}>
                <Monitor className="h-3 w-3" />
                {track.participant.name || track.participant.identity} (screen)
              </div>
            </div>
          ))}

          {/* Camera tracks or placeholders */}
          {participants.map((participant) => {
            const camTrack = videoTracks.find(
              (t) => t.participant.sid === participant.sid
            )
            const hasVideo = camTrack?.publication?.track

            return (
              <div
                key={participant.sid}
                className="relative rounded-2xl overflow-hidden flex items-center justify-center"
                style={{ background: '#1a1a2e', minHeight: '200px' }}
              >
                {hasVideo ? (
                  <VideoTrack
                    trackRef={camTrack!}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className="h-20 w-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white"
                      style={{ background: '#7C5CFC' }}
                    >
                      {(participant.name || participant.identity)?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-white text-sm font-medium">
                      {participant.name || participant.identity}
                    </span>
                  </div>
                )}

                {/* Participant name label */}
                <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg text-xs text-white font-medium flex items-center gap-1.5" style={{ background: 'rgba(0,0,0,0.6)' }}>
                  {participant.isMicrophoneEnabled === false && (
                    <MicOff className="h-3 w-3 text-red-400" />
                  )}
                  {participant.name || participant.identity}
                  {participant.isLocal && ' (You)'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Audio tracks (invisible, just play audio) */}
      {audioTracks
        .filter((t) => !t.participant.isLocal)
        .map((track) => (
          <AudioTrack key={track.participant.sid + '-audio'} trackRef={track} />
        ))}

      {/* Controls bar */}
      <div className="flex items-center justify-center gap-3 px-6 py-5">
        <button
          onClick={toggleMute}
          className="h-12 w-12 rounded-2xl flex items-center justify-center transition-all hover:scale-105"
          style={{ background: isMuted ? '#E55B5B' : 'rgba(255,255,255,0.1)' }}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <MicOff className="h-5 w-5 text-white" />
          ) : (
            <Mic className="h-5 w-5 text-white" />
          )}
        </button>

        <button
          onClick={toggleCamera}
          className="h-12 w-12 rounded-2xl flex items-center justify-center transition-all hover:scale-105"
          style={{ background: isCameraOn ? '#7C5CFC' : 'rgba(255,255,255,0.1)' }}
          title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCameraOn ? (
            <Video className="h-5 w-5 text-white" />
          ) : (
            <VideoOff className="h-5 w-5 text-white" />
          )}
        </button>

        <button
          onClick={toggleScreenShare}
          className="h-12 w-12 rounded-2xl flex items-center justify-center transition-all hover:scale-105"
          style={{ background: isScreenSharing ? '#7C5CFC' : 'rgba(255,255,255,0.1)' }}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          <Monitor className="h-5 w-5 text-white" />
        </button>

        <div className="w-px h-8 mx-2" style={{ background: 'rgba(255,255,255,0.1)' }} />

        <button
          onClick={handleLeave}
          className="h-12 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all hover:scale-105 text-white font-semibold text-sm"
          style={{ background: '#E55B5B' }}
          title="Leave call"
        >
          <PhoneOff className="h-5 w-5" />
          Leave
        </button>
      </div>
    </div>
  )
}
