import { test } from "node:test";
import assert from "node:assert/strict";
import { hasMachineView } from "./pages";

/**
 * The human/machine switch floats over the bottom-left corner, which on a
 * workspace screen is somebody's sidebar. The deny list is what keeps it off
 * those, and it drifted: /mind and /achievements were added to the app nav
 * without being added here, so the switch sat on top of the "Elsewhere" links
 * on both.
 */
test("the switch stays off the workspace", () => {
  for (const path of [
    "/brains",
    "/brains/some-slug/notes",
    "/settings/usage",
    "/mind",
    "/achievements",
    "/chat",
    "/admin/errors",
    "/learn/mozg/next",
    "/welcome",
  ]) {
    assert.equal(hasMachineView(path, true), false, path);
  }
});

test("and stays on the pages written to be read", () => {
  for (const path of ["/", "/explore", "/pricing", "/guide", "/b/mozg/mcp", "/stories"]) {
    assert.equal(hasMachineView(path, true), true, path);
  }
});

/**
 * /connect is both things: the marketing page carrying the config for each MCP
 * client — which is exactly the page an agent should be able to lift as a fact
 * sheet — and the "Connect an agent" item in the workspace nav. Who is looking
 * decides.
 */
test("/connect keeps its sheet for visitors and loses it inside the workspace", () => {
  assert.equal(hasMachineView("/connect", false), true);
  assert.equal(hasMachineView("/connect", true), false);
});

/** A badge is embedded in someone else's README like an image. */
test("a badge never carries the switch", () => {
  assert.equal(hasMachineView("/b/mozg/mcp/badge", false), false);
});
