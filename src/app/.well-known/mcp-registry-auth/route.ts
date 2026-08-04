/**
 * Domain proof for the official MCP Registry.
 *
 * Publishing `sh.mozg/mozg` means proving we own mozg.sh: the registry fetches
 * this line and checks that the publish request was signed by the matching
 * private key (`MCP_PRIVATE_KEY` in the publish workflow). Only the public half
 * lives here — rotating the key means replacing this line and the secret
 * together, and deploying before the next publish.
 *
 * https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx
 */
const PROOF = "v=MCPv1; k=ed25519; p=cwH1jI3ane91WyK7TKv+cBM2kT2Eke4F2Iz8EdyXw0c=";

export function GET() {
  return new Response(`${PROOF}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
