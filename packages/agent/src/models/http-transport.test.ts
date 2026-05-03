import assert from "node:assert/strict";
import { test } from "vitest";

import { fetchJsonResponse } from "./http-transport.ts";

test("fetchJsonResponse sends POST JSON and returns parsed data", async () => {
  const result = await fetchJsonResponse({
    url: "https://provider.example/v1/messages",
    body: { model: "claude-test" },
    headers: { "content-type": "application/json" },
    fetch: async (input, init) => {
      assert.equal(String(input), "https://provider.example/v1/messages");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { model: "claude-test" });

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  assert.deepEqual(result, { ok: true });
});

test("fetchJsonResponse throws with status and body text on non-ok responses", async () => {
  await assert.rejects(
    () =>
      fetchJsonResponse({
        url: "https://provider.example/v1/messages",
        body: {},
        headers: {},
        fetch: async () =>
          new Response("rate limited", { status: 429, statusText: "Too Many Requests" }),
      }),
    (error: Error) => {
      assert.match(error.message, /429/);
      assert.match(error.message, /rate limited/i);
      return true;
    },
  );
});
