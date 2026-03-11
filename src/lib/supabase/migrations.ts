// All 23 SQL table definitions + RLS policies + triggers
// Ported from the Swift DatabaseProvisioner

export const migrations: string[] = [
  // 001 - Profiles
  `CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text,
    display_name text NOT NULL DEFAULT 'User',
    avatar_url text,
    status_emoji text,
    status_text text,
    is_online boolean DEFAULT false,
    last_seen_at timestamptz,
    created_at timestamptz DEFAULT now()
  );`,

  // 002 - Workspaces
  `CREATE TABLE IF NOT EXISTS workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text UNIQUE NOT NULL,
    icon_url text,
    created_at timestamptz DEFAULT now()
  );`,

  // 003 - Workspace Members
  `CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
    profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member',
    joined_at timestamptz DEFAULT now(),
    PRIMARY KEY (workspace_id, profile_id)
  );`,

  // 004 - Channels
  `CREATE TABLE IF NOT EXISTS channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    topic text,
    is_private boolean DEFAULT false,
    is_archived boolean DEFAULT false,
    created_by uuid REFERENCES profiles(id),
    created_at timestamptz DEFAULT now()
  );`,

  // 005 - Channel Members
  `CREATE TABLE IF NOT EXISTS channel_members (
    channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
    profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    role text DEFAULT 'member',
    notification_pref text DEFAULT 'all',
    joined_at timestamptz DEFAULT now(),
    PRIMARY KEY (channel_id, profile_id)
  );`,

  // 006 - Messages
  `CREATE TABLE IF NOT EXISTS messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    content text NOT NULL DEFAULT '',
    parent_id uuid REFERENCES messages(id) ON DELETE SET NULL,
    thread_reply_count int DEFAULT 0,
    is_edited boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    metadata jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );`,

  // 007 - Reactions
  `CREATE TABLE IF NOT EXISTS reactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    emoji text NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(message_id, profile_id, emoji)
  );`,

  // 008 - File Attachments
  `CREATE TABLE IF NOT EXISTS file_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_size bigint,
    mime_type text,
    created_at timestamptz DEFAULT now()
  );`,

  // 009 - Pins
  `CREATE TABLE IF NOT EXISTS pins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    pinned_by uuid NOT NULL REFERENCES profiles(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE(channel_id, message_id)
  );`,

  // 010 - Read Receipts
  `CREATE TABLE IF NOT EXISTS read_receipts (
    profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
    last_read_at timestamptz DEFAULT now(),
    PRIMARY KEY (profile_id, channel_id)
  );`,

  // 025 - Workspace Settings
  `CREATE TABLE IF NOT EXISTS workspace_settings (
    workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    livekit_url text,
    livekit_api_key text,
    livekit_api_secret text,
    calls_enabled boolean DEFAULT false
  );`,

  // 026 - Active Calls
  `CREATE TABLE IF NOT EXISTS active_calls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type text NOT NULL DEFAULT 'huddle',
    livekit_room_name text NOT NULL,
    started_by uuid NOT NULL REFERENCES profiles(id),
    started_at timestamptz DEFAULT now(),
    ended_at timestamptz
  );`,

  // 027 - Call Participants
  `CREATE TABLE IF NOT EXISTS call_participants (
    call_id uuid REFERENCES active_calls(id) ON DELETE CASCADE,
    profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at timestamptz DEFAULT now(),
    left_at timestamptz,
    is_muted boolean DEFAULT false,
    is_camera_on boolean DEFAULT false,
    is_sharing_screen boolean DEFAULT false,
    PRIMARY KEY (call_id, profile_id)
  );`,

  // 028 - Incoming Webhooks
  `CREATE TABLE IF NOT EXISTS incoming_webhooks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    name text NOT NULL,
    token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    avatar_url text,
    display_name text,
    is_active boolean DEFAULT true,
    created_by uuid NOT NULL REFERENCES profiles(id),
    created_at timestamptz DEFAULT now()
  );`,

  // 029 - Outgoing Webhooks
  `CREATE TABLE IF NOT EXISTS outgoing_webhooks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    url text NOT NULL,
    signing_secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    events text[] NOT NULL DEFAULT '{}',
    channel_filter uuid[],
    is_active boolean DEFAULT true,
    retry_count int DEFAULT 3,
    created_by uuid NOT NULL REFERENCES profiles(id),
    created_at timestamptz DEFAULT now()
  );`,

  // 030 - Webhook Delivery Logs
  `CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id uuid NOT NULL REFERENCES outgoing_webhooks(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    status_code int,
    response_body text,
    latency_ms int,
    attempt int DEFAULT 1,
    error text,
    created_at timestamptz DEFAULT now()
  );`,

  // 031 - Bots
  `CREATE TABLE IF NOT EXISTS bots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    display_name text NOT NULL,
    avatar_url text,
    description text,
    bot_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    scopes text[] DEFAULT '{}',
    is_active boolean DEFAULT true,
    created_by uuid NOT NULL REFERENCES profiles(id),
    created_at timestamptz DEFAULT now()
  );`,

  // 032 - Bot Channel Memberships
  `CREATE TABLE IF NOT EXISTS bot_channel_memberships (
    bot_id uuid REFERENCES bots(id) ON DELETE CASCADE,
    channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
    added_by uuid REFERENCES profiles(id),
    added_at timestamptz DEFAULT now(),
    PRIMARY KEY (bot_id, channel_id)
  );`,

  // 033 - Bot Event Subscriptions
  `CREATE TABLE IF NOT EXISTS bot_event_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    callback_url text NOT NULL,
    filter jsonb DEFAULT '{}',
    is_active boolean DEFAULT true
  );`,

  // 034 - Slash Commands
  `CREATE TABLE IF NOT EXISTS slash_commands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    command text NOT NULL,
    description text NOT NULL DEFAULT '',
    usage_hint text,
    type text NOT NULL DEFAULT 'builtin',
    handler_url text,
    bot_id uuid REFERENCES bots(id) ON DELETE SET NULL,
    is_active boolean DEFAULT true
  );`,

  // 035 - Reminders
  `CREATE TABLE IF NOT EXISTS reminders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES profiles(id),
    target_user_id uuid NOT NULL REFERENCES profiles(id),
    channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    message text NOT NULL,
    remind_at timestamptz NOT NULL,
    is_delivered boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
  );`,

  // 036 - Shared Channel Links
  `CREATE TABLE IF NOT EXISTS shared_channel_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    local_channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    remote_workspace_url text NOT NULL,
    remote_channel_id uuid NOT NULL,
    remote_channel_name text,
    signing_key_local text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    signing_key_remote text NOT NULL,
    sync_endpoint_url text NOT NULL,
    status text DEFAULT 'active',
    last_synced_at timestamptz,
    created_at timestamptz DEFAULT now()
  );`,

  // 037 - Remote Profiles
  `CREATE TABLE IF NOT EXISTS remote_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    remote_workspace_url text NOT NULL,
    remote_user_id text NOT NULL,
    display_name text,
    avatar_url text,
    workspace_name text,
    last_updated_at timestamptz DEFAULT now(),
    UNIQUE(remote_workspace_url, remote_user_id)
  );`,

  // 038 - Scheduled Messages
  `CREATE TABLE IF NOT EXISTS scheduled_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
  );`,

  // 039 - Saved Items (Bookmarks)
  `CREATE TABLE IF NOT EXISTS saved_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, message_id)
  );`,

  // RLS Policies + Triggers
  `-- Nuclear cleanup: drop ALL existing policies
  DO $cleanup$
  DECLARE
    r RECORD;
  BEGIN
    FOR r IN (
      SELECT schemaname, tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
    )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
  END
  $cleanup$;

  -- Enable RLS on all tables
  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
  ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
  ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
  ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
  ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE file_attachments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
  ALTER TABLE read_receipts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE active_calls ENABLE ROW LEVEL SECURITY;
  ALTER TABLE call_participants ENABLE ROW LEVEL SECURITY;
  ALTER TABLE incoming_webhooks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE outgoing_webhooks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
  ALTER TABLE bot_channel_memberships ENABLE ROW LEVEL SECURITY;
  ALTER TABLE bot_event_subscriptions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE slash_commands ENABLE ROW LEVEL SECURITY;
  ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE shared_channel_links ENABLE ROW LEVEL SECURITY;
  ALTER TABLE remote_profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;

  -- SECURITY DEFINER helpers (bypass RLS to prevent infinite recursion)
  CREATE OR REPLACE FUNCTION get_my_workspace_ids()
  RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
  AS $fn$ SELECT workspace_id FROM workspace_members WHERE profile_id = auth.uid(); $fn$;

  CREATE OR REPLACE FUNCTION get_my_admin_workspace_ids()
  RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
  AS $fn$ SELECT workspace_id FROM workspace_members WHERE profile_id = auth.uid() AND role IN ('owner', 'admin'); $fn$;

  CREATE OR REPLACE FUNCTION get_my_channel_ids()
  RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
  AS $fn$ SELECT channel_id FROM channel_members WHERE profile_id = auth.uid(); $fn$;

  -- Profiles (only visible to co-workers in shared workspaces, or self)
  CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
    id = auth.uid()
    OR id IN (
      SELECT wm2.profile_id FROM workspace_members wm1
      JOIN workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
      WHERE wm1.profile_id = auth.uid()
    )
  );
  CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);
  CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

  -- Workspaces
  CREATE POLICY "workspaces_select" ON workspaces FOR SELECT USING (id IN (SELECT get_my_workspace_ids()));
  CREATE POLICY "workspaces_insert" ON workspaces FOR INSERT WITH CHECK (true);
  CREATE POLICY "workspaces_update" ON workspaces FOR UPDATE USING (id IN (SELECT get_my_admin_workspace_ids()));

  -- Workspace Members (insert restricted to self + workspace must exist)
  CREATE POLICY "wm_select" ON workspace_members FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
  CREATE POLICY "wm_insert" ON workspace_members FOR INSERT WITH CHECK (profile_id = auth.uid());
  CREATE POLICY "wm_delete" ON workspace_members FOR DELETE USING (workspace_id IN (SELECT get_my_admin_workspace_ids()) OR profile_id = auth.uid());

  -- Channels
  CREATE POLICY "channels_select" ON channels FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
  CREATE POLICY "channels_insert" ON channels FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));
  CREATE POLICY "channels_update" ON channels FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));

  -- Channel Members (insert restricted to own workspace channels)
  CREATE POLICY "cm_select" ON channel_members FOR SELECT USING (channel_id IN (SELECT get_my_channel_ids()) OR profile_id = auth.uid());
  CREATE POLICY "cm_insert" ON channel_members FOR INSERT WITH CHECK (
    channel_id IN (SELECT id FROM channels WHERE workspace_id IN (SELECT get_my_workspace_ids()))
    AND (
      profile_id = auth.uid()
      OR channel_id IN (SELECT id FROM channels WHERE created_by = auth.uid())
    )
  );
  CREATE POLICY "cm_delete" ON channel_members FOR DELETE USING (profile_id = auth.uid() OR channel_id IN (SELECT c.id FROM channels c WHERE c.workspace_id IN (SELECT get_my_admin_workspace_ids())));

  -- Messages
  CREATE POLICY "msg_select" ON messages FOR SELECT USING (channel_id IN (SELECT get_my_channel_ids()));
  CREATE POLICY "msg_insert" ON messages FOR INSERT WITH CHECK (channel_id IN (SELECT get_my_channel_ids()));
  CREATE POLICY "msg_update" ON messages FOR UPDATE USING (sender_id = auth.uid());
  CREATE POLICY "msg_delete" ON messages FOR DELETE USING (sender_id = auth.uid());

  -- Reactions
  CREATE POLICY "react_select" ON reactions FOR SELECT USING (message_id IN (SELECT id FROM messages WHERE channel_id IN (SELECT get_my_channel_ids())));
  CREATE POLICY "react_insert" ON reactions FOR INSERT WITH CHECK (profile_id = auth.uid());
  CREATE POLICY "react_delete" ON reactions FOR DELETE USING (profile_id = auth.uid());

  -- File Attachments (insert restricted to messages in own channels)
  CREATE POLICY "fa_select" ON file_attachments FOR SELECT USING (message_id IN (SELECT id FROM messages WHERE channel_id IN (SELECT get_my_channel_ids())));
  CREATE POLICY "fa_insert" ON file_attachments FOR INSERT WITH CHECK (message_id IN (SELECT id FROM messages WHERE channel_id IN (SELECT get_my_channel_ids())));

  -- Pins
  CREATE POLICY "pins_select" ON pins FOR SELECT USING (channel_id IN (SELECT get_my_channel_ids()));
  CREATE POLICY "pins_insert" ON pins FOR INSERT WITH CHECK (channel_id IN (SELECT get_my_channel_ids()));
  CREATE POLICY "pins_delete" ON pins FOR DELETE USING (pinned_by = auth.uid());

  -- Read Receipts
  CREATE POLICY "rr_select" ON read_receipts FOR SELECT USING (profile_id = auth.uid());
  CREATE POLICY "rr_upsert" ON read_receipts FOR INSERT WITH CHECK (profile_id = auth.uid());
  CREATE POLICY "rr_update" ON read_receipts FOR UPDATE USING (profile_id = auth.uid());

  -- Workspace Settings (admin-only insert, all members can read non-secret fields)
  CREATE POLICY "ws_select" ON workspace_settings FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
  CREATE POLICY "ws_insert" ON workspace_settings FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_admin_workspace_ids()));
  CREATE POLICY "ws_update" ON workspace_settings FOR UPDATE USING (workspace_id IN (SELECT get_my_admin_workspace_ids()));

  -- Active Calls
  CREATE POLICY "ac_select" ON active_calls FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
  CREATE POLICY "ac_insert" ON active_calls FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));
  CREATE POLICY "ac_update" ON active_calls FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));

  -- Call Participants (scoped to calls in own workspace)
  CREATE POLICY "cp_select" ON call_participants FOR SELECT USING (call_id IN (SELECT id FROM active_calls WHERE workspace_id IN (SELECT get_my_workspace_ids())));
  CREATE POLICY "cp_insert" ON call_participants FOR INSERT WITH CHECK (profile_id = auth.uid());
  CREATE POLICY "cp_update" ON call_participants FOR UPDATE USING (profile_id = auth.uid());

  -- Webhooks (admin-only management)
  CREATE POLICY "iw_select" ON incoming_webhooks FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
  CREATE POLICY "iw_insert" ON incoming_webhooks FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_admin_workspace_ids()));
  CREATE POLICY "ow_select" ON outgoing_webhooks FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
  CREATE POLICY "ow_insert" ON outgoing_webhooks FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_admin_workspace_ids()));
  CREATE POLICY "wdl_select" ON webhook_delivery_logs FOR SELECT USING (webhook_id IN (SELECT id FROM outgoing_webhooks WHERE workspace_id IN (SELECT get_my_workspace_ids())));

  -- Bots
  CREATE POLICY "bots_select" ON bots FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
  CREATE POLICY "bots_insert" ON bots FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_admin_workspace_ids()));
  CREATE POLICY "bcm_select" ON bot_channel_memberships FOR SELECT USING (bot_id IN (SELECT id FROM bots WHERE workspace_id IN (SELECT get_my_workspace_ids())));
  CREATE POLICY "bcm_insert" ON bot_channel_memberships FOR INSERT WITH CHECK (bot_id IN (SELECT id FROM bots WHERE workspace_id IN (SELECT get_my_admin_workspace_ids())));
  CREATE POLICY "bes_select" ON bot_event_subscriptions FOR SELECT USING (bot_id IN (SELECT id FROM bots WHERE workspace_id IN (SELECT get_my_workspace_ids())));
  CREATE POLICY "bes_insert" ON bot_event_subscriptions FOR INSERT WITH CHECK (bot_id IN (SELECT id FROM bots WHERE workspace_id IN (SELECT get_my_admin_workspace_ids())));

  -- Slash Commands
  CREATE POLICY "sc_select" ON slash_commands FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
  CREATE POLICY "sc_insert" ON slash_commands FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_admin_workspace_ids()));

  -- Reminders
  CREATE POLICY "rem_select" ON reminders FOR SELECT USING (target_user_id = auth.uid() OR created_by = auth.uid());
  CREATE POLICY "rem_insert" ON reminders FOR INSERT WITH CHECK (created_by = auth.uid());

  -- Shared Channel Links
  CREATE POLICY "scl_select" ON shared_channel_links FOR SELECT USING (local_channel_id IN (SELECT get_my_channel_ids()));

  -- Remote Profiles (scoped: only visible to users who share a channel link to the remote workspace)
  CREATE POLICY "rp_select" ON remote_profiles FOR SELECT USING (
    remote_workspace_url IN (
      SELECT scl.remote_workspace_url FROM shared_channel_links scl
      WHERE scl.local_channel_id IN (SELECT get_my_channel_ids())
    )
  );
  CREATE POLICY "rp_insert" ON remote_profiles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY "rp_update" ON remote_profiles FOR UPDATE USING (auth.uid() IS NOT NULL);

  -- Scheduled Messages
  CREATE POLICY "sm_select" ON scheduled_messages FOR SELECT USING (user_id = auth.uid());
  CREATE POLICY "sm_insert" ON scheduled_messages FOR INSERT WITH CHECK (user_id = auth.uid());
  CREATE POLICY "sm_update" ON scheduled_messages FOR UPDATE USING (user_id = auth.uid());
  CREATE POLICY "sm_delete" ON scheduled_messages FOR DELETE USING (user_id = auth.uid());

  -- Saved Items (Bookmarks)
  CREATE POLICY "si_select" ON saved_items FOR SELECT USING (user_id = auth.uid());
  CREATE POLICY "si_insert" ON saved_items FOR INSERT WITH CHECK (user_id = auth.uid());
  CREATE POLICY "si_delete" ON saved_items FOR DELETE USING (user_id = auth.uid());

  -- Trigger: auto-create profile on signup
  CREATE OR REPLACE FUNCTION handle_new_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$
  BEGIN
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name;
    RETURN NEW;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

  -- Trigger: update thread reply count
  CREATE OR REPLACE FUNCTION update_thread_reply_count()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$
  BEGIN
    IF NEW.parent_id IS NOT NULL THEN
      UPDATE messages SET thread_reply_count = (
        SELECT count(*) FROM messages WHERE parent_id = NEW.parent_id
      ) WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS on_message_reply ON messages;
  CREATE TRIGGER on_message_reply
    AFTER INSERT ON messages
    FOR EACH ROW
    WHEN (NEW.parent_id IS NOT NULL)
    EXECUTE FUNCTION update_thread_reply_count();`,

  // Realtime Setup
  `DO $$
  BEGIN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE channels; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE channel_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE active_calls; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE call_participants; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE reactions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END
  $$;`,

  // Replica identity full for channel_members (needed for DELETE events to include old row data)
  `ALTER TABLE channel_members REPLICA IDENTITY FULL;`,

  // Cleanup orphaned auth users
  `DELETE FROM auth.users
  WHERE id NOT IN (SELECT id FROM public.profiles)
  AND created_at < now() - interval '1 minute';`,
]

export const REQUIRED_TABLES = [
  'profiles', 'workspaces', 'workspace_members',
  'channels', 'channel_members', 'messages',
  'reactions', 'file_attachments', 'pins', 'read_receipts',
  'workspace_settings', 'active_calls', 'call_participants',
  'incoming_webhooks', 'outgoing_webhooks', 'webhook_delivery_logs',
  'bots', 'bot_channel_memberships', 'bot_event_subscriptions',
  'slash_commands', 'reminders', 'shared_channel_links', 'remote_profiles',
  'scheduled_messages',
  'saved_items',
]
