# The site's server, on its host

The pages of mozg.sh are files. Beside them runs one small server, built from
the same source, for four things a page cannot do alone: the chat, the errors
pages report, the announcements, and the operator's panel. The plugin is not
in it, and nothing on a person's machine talks to it.

## Once, on the host

1. Put the two lines of `nginx.conf` that are outside the `location` blocks
   (`limit_req_zone`) into the `http { … }` block of nginx.
2. Put the rest inside the `server { … }` block for mozg.sh, beside the
   `ssl_certificate` lines.
3. `cp .env.example .env` and fill it in. The values never go in a repository.
4. `docker compose up -d --build` the first time can be left to the deploy
   script.

## Every time

From the root of the repository:

```
deploy/site/deploy.sh user@host
```

It builds here, copies the source, builds the image there, starts it, copies
the pages to where nginx looks, and asks the server whether it is up. It does
not touch nginx's configuration.

## The panel

<https://mozg.sh/admin/> opens by a link mailed to one address. The link works
once and holds fifteen minutes. Without mail, on the host:

```
docker compose -f /srv/mozg/src/deploy/site/docker-compose.yml exec site node dist/site-server.mjs token
```

prints a link, to paste into a browser. It holds fifteen minutes too.

## What it keeps

`deploy/site/data/` on the host: one file per thread, then `errors.json`,
`announcements.json`, `drafts.json` and two short lists of single-use tokens.
Back the folder up as any other; **Download it as one file** in the panel gives
the same as one JSON.

## Names of the settings

| | |
|---|---|
| `MOZG_SITE_ORIGIN` | where the site is served from; the only Origin the API answers |
| `MOZG_OPERATOR_EMAIL` | the one address the panel opens for |
| `MOZG_SECRET` | signs the session and the links in letters (`openssl rand -hex 32`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | the mail; without both, mail stays off |
| `MOZG_OPERATOR_LANG` | optional: `ru` or `en`, the language of the operator's letters |
| `MOZG_DATA` | the data folder (`/data` in the image) |
| `MOZG_TRUST_PROXY` | `1` behind nginx, to read the caller's address |

The image sets `MOZG_DATA` and `MOZG_TRUST_PROXY` itself.
