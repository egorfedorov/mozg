-- BYOK grows a second protocol: the OpenAI-compatible chat.completions
-- surface, which is how OpenAI, Kimi/Moonshot, DeepSeek, Qwen and GLM all
-- speak. The provider decides which wire format the worker uses; the model
-- is the user's choice because we cannot know a stranger's catalogue.
alter table "user" add column ai_provider text not null default 'anthropic'
  check (ai_provider in ('anthropic', 'openai'));
alter table "user" add column ai_model text;
