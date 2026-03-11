// Types for all 23 OpenHive database tables

export interface Profile {
  id: string
  email: string | null
  display_name: string
  avatar_url: string | null
  status_emoji: string | null
  status_text: string | null
  is_online: boolean
  last_seen_at: string | null
  created_at: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
  icon_url: string | null
  created_at: string
}

export interface WorkspaceMember {
  workspace_id: string
  profile_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  workspace?: Workspace
  profile?: Profile
}

export interface Channel {
  id: string
  workspace_id: string
  name: string
  description: string | null
  topic: string | null
  is_private: boolean
  is_archived: boolean
  created_by: string | null
  created_at: string
}

export interface ChannelMember {
  channel_id: string
  profile_id: string
  role: string
  notification_pref: string
  joined_at: string
}

export interface Message {
  id: string
  channel_id: string
  sender_id: string | null
  content: string
  parent_id: string | null
  thread_reply_count: number
  is_edited: boolean
  is_deleted: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  // Joined
  sender?: Profile
}

export interface Reaction {
  id: string
  message_id: string
  profile_id: string
  emoji: string
  created_at: string
}

export interface FileAttachment {
  id: string
  message_id: string
  file_name: string
  file_url: string
  file_size: number | null
  mime_type: string | null
  created_at: string
}

export interface Pin {
  id: string
  channel_id: string
  message_id: string
  pinned_by: string
  created_at: string
}

export interface ReadReceipt {
  profile_id: string
  channel_id: string
  last_read_at: string
}

export interface WorkspaceSettings {
  workspace_id: string
  livekit_url: string | null
  livekit_api_key: string | null
  livekit_api_secret: string | null
  calls_enabled: boolean
}

export interface ActiveCall {
  id: string
  channel_id: string
  workspace_id: string
  type: 'huddle' | 'video_call'
  livekit_room_name: string
  started_by: string
  started_at: string
  ended_at: string | null
}

export interface CallParticipant {
  call_id: string
  profile_id: string
  joined_at: string
  left_at: string | null
  is_muted: boolean
  is_camera_on: boolean
  is_sharing_screen: boolean
}

export interface IncomingWebhook {
  id: string
  workspace_id: string
  channel_id: string
  name: string
  token: string
  avatar_url: string | null
  display_name: string | null
  is_active: boolean
  created_by: string
  created_at: string
}

export interface OutgoingWebhook {
  id: string
  workspace_id: string
  name: string
  url: string
  signing_secret: string
  events: string[]
  channel_filter: string[] | null
  is_active: boolean
  retry_count: number
  created_by: string
  created_at: string
}

export interface WebhookDeliveryLog {
  id: string
  webhook_id: string
  event_type: string
  status_code: number | null
  response_body: string | null
  latency_ms: number | null
  attempt: number
  error: string | null
  created_at: string
}

export interface Bot {
  id: string
  workspace_id: string
  name: string
  display_name: string
  avatar_url: string | null
  description: string | null
  bot_token: string
  scopes: string[]
  is_active: boolean
  created_by: string
  created_at: string
}

export interface SlashCommand {
  id: string
  workspace_id: string
  command: string
  description: string
  usage_hint: string | null
  type: 'builtin' | 'custom' | 'bot'
  handler_url: string | null
  bot_id: string | null
  is_active: boolean
}

export interface Reminder {
  id: string
  workspace_id: string
  created_by: string
  target_user_id: string
  channel_id: string
  message: string
  remind_at: string
  is_delivered: boolean
  created_at: string
}

export interface ScheduledMessage {
  id: string
  user_id: string
  channel_id: string
  workspace_id: string
  content: string
  scheduled_for: string
  sent: boolean
  created_at: string
}

export interface SavedItem {
  id: string
  user_id: string
  message_id: string
  workspace_id: string
  note: string | null
  created_at: string
  message?: Message
}
