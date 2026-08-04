-- Tables owned by better-auth's mcp plugin. Skipped wholesale when a
-- database already has them (a developer who ran `npm run auth:migrate`
-- before pulling this migration) — the plugin's own CLI and this file
-- must not fight over the same three tables.
do $mcp$ begin
if to_regclass('public."oauthAccessToken"') is not null then return; end if;

CREATE TABLE IF NOT EXISTS public."oauthAccessToken" (
    id text NOT NULL,
    "accessToken" text NOT NULL,
    "refreshToken" text NOT NULL,
    "accessTokenExpiresAt" timestamp with time zone NOT NULL,
    "refreshTokenExpiresAt" timestamp with time zone NOT NULL,
    "clientId" text NOT NULL,
    "userId" text,
    scopes text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);
CREATE TABLE IF NOT EXISTS public."oauthApplication" (
    id text NOT NULL,
    name text NOT NULL,
    icon text,
    metadata text,
    "clientId" text NOT NULL,
    "clientSecret" text,
    "redirectUrls" text NOT NULL,
    type text NOT NULL,
    disabled boolean,
    "userId" text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);
CREATE TABLE IF NOT EXISTS public."oauthConsent" (
    id text NOT NULL,
    "clientId" text NOT NULL,
    "userId" text NOT NULL,
    scopes text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "consentGiven" boolean NOT NULL
);
do $$ begin
  execute 'ALTER TABLE IF EXISTS public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_accessToken_key" UNIQUE ("accessToken")';
exception when duplicate_object or duplicate_table then null;
end $$;
do $$ begin
  execute 'ALTER TABLE IF EXISTS public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_pkey" PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $$;
do $$ begin
  execute 'ALTER TABLE IF EXISTS public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_refreshToken_key" UNIQUE ("refreshToken")';
exception when duplicate_object or duplicate_table then null;
end $$;
do $$ begin
  execute 'ALTER TABLE IF EXISTS public."oauthApplication"
    ADD CONSTRAINT "oauthApplication_clientId_key" UNIQUE ("clientId")';
exception when duplicate_object or duplicate_table then null;
end $$;
do $$ begin
  execute 'ALTER TABLE IF EXISTS public."oauthApplication"
    ADD CONSTRAINT "oauthApplication_pkey" PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $$;
do $$ begin
  execute 'ALTER TABLE IF EXISTS public."oauthConsent"
    ADD CONSTRAINT "oauthConsent_pkey" PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $$;
CREATE INDEX "oauthAccessToken_clientId_idx" ON public."oauthAccessToken" USING btree ("clientId");
CREATE INDEX "oauthAccessToken_userId_idx" ON public."oauthAccessToken" USING btree ("userId");
CREATE INDEX "oauthApplication_userId_idx" ON public."oauthApplication" USING btree ("userId");
CREATE INDEX "oauthConsent_clientId_idx" ON public."oauthConsent" USING btree ("clientId");
CREATE INDEX "oauthConsent_userId_idx" ON public."oauthConsent" USING btree ("userId");
do $$ begin
  execute 'ALTER TABLE IF EXISTS public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."oauthApplication"("clientId") ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $$;
do $$ begin
  execute 'ALTER TABLE IF EXISTS public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $$;
do $$ begin
  execute 'ALTER TABLE IF EXISTS public."oauthApplication"
    ADD CONSTRAINT "oauthApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $$;
do $$ begin
  execute 'ALTER TABLE IF EXISTS public."oauthConsent"
    ADD CONSTRAINT "oauthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."oauthApplication"("clientId") ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $$;
do $$ begin
  execute 'ALTER TABLE IF EXISTS public."oauthConsent"
    ADD CONSTRAINT "oauthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $$;

-- Tables owned by better-auth's mcp plugin (OAuth for MCP clients:
-- discovery, dynamic registration, access tokens). DDL captured from
-- `auth:migrate` so production's plain-SQL runner can apply it.

end $mcp$;
