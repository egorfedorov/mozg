CREATE TABLE public."oauthAccessToken" (
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
CREATE TABLE public."oauthApplication" (
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
CREATE TABLE public."oauthConsent" (
    id text NOT NULL,
    "clientId" text NOT NULL,
    "userId" text NOT NULL,
    scopes text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "consentGiven" boolean NOT NULL
);
ALTER TABLE ONLY public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_accessToken_key" UNIQUE ("accessToken");
ALTER TABLE ONLY public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_refreshToken_key" UNIQUE ("refreshToken");
ALTER TABLE ONLY public."oauthApplication"
    ADD CONSTRAINT "oauthApplication_clientId_key" UNIQUE ("clientId");
ALTER TABLE ONLY public."oauthApplication"
    ADD CONSTRAINT "oauthApplication_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."oauthConsent"
    ADD CONSTRAINT "oauthConsent_pkey" PRIMARY KEY (id);
CREATE INDEX "oauthAccessToken_clientId_idx" ON public."oauthAccessToken" USING btree ("clientId");
CREATE INDEX "oauthAccessToken_userId_idx" ON public."oauthAccessToken" USING btree ("userId");
CREATE INDEX "oauthApplication_userId_idx" ON public."oauthApplication" USING btree ("userId");
CREATE INDEX "oauthConsent_clientId_idx" ON public."oauthConsent" USING btree ("clientId");
CREATE INDEX "oauthConsent_userId_idx" ON public."oauthConsent" USING btree ("userId");
ALTER TABLE ONLY public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."oauthApplication"("clientId") ON DELETE CASCADE;
ALTER TABLE ONLY public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."oauthApplication"
    ADD CONSTRAINT "oauthApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."oauthConsent"
    ADD CONSTRAINT "oauthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."oauthApplication"("clientId") ON DELETE CASCADE;
ALTER TABLE ONLY public."oauthConsent"
    ADD CONSTRAINT "oauthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

-- Tables owned by better-auth's mcp plugin (OAuth for MCP clients:
-- discovery, dynamic registration, access tokens). DDL captured from
-- `auth:migrate` so production's plain-SQL runner can apply it.
