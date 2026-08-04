# Listing mozg in the official MCP Registry

[registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io) is
the upstream index that MCP clients and aggregators read to discover servers. It
stores metadata only — no code, no artifacts. For mozg that metadata is one
file, [`server.json`](../server.json), and all it really says is: there is a
streamable-HTTP server at `https://mozg.sh/mcp`, here is its name, icon and how
to authenticate against it.

Published name: **`sh.mozg/mozg`**.

## Why that name, and what it costs us

The registry only lets you publish under a namespace you can prove you own.
Two ways to prove it, and the choice is permanent-ish because the name is
public:

- GitHub auth gives `io.github.<user>/*` — free, but the public name would read
  `io.github.egorfedorov/mozg`.
- Domain auth gives the reverse-DNS form of a domain you control. We own
  `mozg.sh`, so we get `sh.mozg/*`.

We took the domain. The price is a keypair: the registry checks that a publish
request is signed by the private key matching the public key served at
[`/.well-known/mcp-registry-auth`](../src/app/.well-known/mcp-registry-auth/route.ts).

That route is the whole proof. It must be deployed to production **before** a
publish, or the registry has nothing to check the signature against and login
fails. The private half never enters the repo; it lives in the
`MCP_PRIVATE_KEY` GitHub secret (64-char hex, Ed25519), with the maintainer's
copy in the macOS login keychain:

```bash
security find-generic-password -s mozg-mcp-registry -w
```

## Publishing

The registry refuses to re-publish a version it already holds, and published
metadata is immutable. So every change to `server.json` needs its `version`
bumped — that field is registry metadata, not the app's version.

1. Edit `server.json`, bump `version`.
2. Merge to `main` and deploy (only matters if the well-known key changed).
3. Run the **Publish to MCP Registry** workflow
   (`.github/workflows/publish-mcp.yml`) — it is `workflow_dispatch` only,
   because nothing here is built or uploaded and continuous publishing would
   just burn version numbers.

Verify:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=sh.mozg/mozg"
```

### Publishing by hand

Same steps the workflow runs, if CI is not an option:

```bash
brew install mcp-publisher   # or grab the binary from the registry's releases

mcp-publisher login http --domain mozg.sh --private-key "$MCP_PRIVATE_KEY"
mcp-publisher publish
```

## Rotating the key

The key can publish and overwrite anything under `sh.mozg/*`, so treat it as
production credentials. To rotate:

```bash
openssl genpkey -algorithm Ed25519 -out key.pem
openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64        # public
openssl pkey -in key.pem -noout -text | grep -A3 priv: | tail -n +2 | tr -d ' :\n'  # private hex
```

macOS ships LibreSSL as the system `openssl`, which cannot generate Ed25519
keys — use `brew install openssl@3` and call
`/opt/homebrew/opt/openssl@3/bin/openssl`.

Put the public line in the well-known route, the private hex in
`MCP_PRIVATE_KEY`, then deploy. Both halves have to move together: a deployed
public key with a stale secret (or the reverse) fails login with a bare
signature error.

## What we deliberately left out

- **No `packages` entry.** mozg is a hosted service, not something you `npx`.
  Self-hosters point their client at their own instance, which the registry has
  no way to describe.
- **`Authorization` is declared optional.** mozg accepts both a bearer token
  from `/settings/tokens` and full MCP OAuth (we serve
  `/.well-known/oauth-protected-resource` and answer 401 with
  `WWW-Authenticate`). Marking the header required would force clients that can
  do OAuth to demand a token they do not need.
- **Publishing on tag push.** The repo does not tag releases, and registry
  versions move only when this metadata changes — which is rarely.

## Upstream docs

The registry's own docs live at
[modelcontextprotocol/registry/docs](https://github.com/modelcontextprotocol/registry/tree/main/docs):
[quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx),
[remote servers](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/remote-servers.mdx),
[authentication](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx),
[versioning](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/versioning.mdx).
The registry is in preview: it warns that breaking changes and data resets can
still happen, so expect to re-publish one day.
