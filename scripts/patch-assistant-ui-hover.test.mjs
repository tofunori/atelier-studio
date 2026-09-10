import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyAssistantUiHoverPatch,
  ASSISTANT_UI_VERSION,
} from "./patch-assistant-ui-hover.mjs";

const packageRoot = path.resolve("node_modules/@assistant-ui/react");

test("assistant-ui hover patch is applied and idempotent", () => {
  const result = applyAssistantUiHoverPatch(packageRoot);

  assert.equal(result.changed, false);
  const source = fs.readFileSync(
    path.join(packageRoot, "src/primitives/message/MessageRoot.tsx"),
    "utf8",
  );
  const dist = fs.readFileSync(
    path.join(packageRoot, "dist/primitives/message/MessageRoot.js"),
    "utf8",
  );

  assert.match(source, /committedMessageRef/);
  assert.match(dist, /committedMessageRef/);
  assert.doesNotMatch(source, /queueMicrotask\(\(\) => message\.setIsHovering/);
  assert.doesNotMatch(dist, /queueMicrotask\(\(\) => message\.setIsHovering/);
});

test("assistant-ui hover patch rejects unsupported package versions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atelier-assistant-ui-"));
  try {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@assistant-ui/react", version: "0.15.19" }),
    );

    assert.throws(
      () => applyAssistantUiHoverPatch(root),
      new RegExp(`supports @assistant-ui/react ${ASSISTANT_UI_VERSION}`),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
