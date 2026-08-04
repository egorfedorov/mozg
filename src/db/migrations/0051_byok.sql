-- Bring-your-own-key training: a user may store their own Anthropic-style
-- API key, and their brains then train and examine on THEIR spend instead of
-- the platform's. The key is stored AES-256-GCM encrypted (lib/secretbox);
-- the hint is the last four characters, for the settings page only.
alter table "user" add column ai_key_enc text;
alter table "user" add column ai_key_hint text;
alter table "user" add column ai_base_url text;
