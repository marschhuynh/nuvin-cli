import assert from "node:assert/strict";
import { test } from "vitest";
import type { ModelRequest, ProviderRequestMutator } from "../shared/types.ts";
import { ProviderSessionManager, prepareProviderRequest } from "./provider-session.ts";

function createRequest(): ModelRequest {
  return {
    model: "claude-test",
    max_tokens: 111,
    system: [],
    messages: [],
    tools: [],
    metadata: {
      session_id: "session-1",
      turn_id: "turn-1",
    },
  };
}

test("ProviderSessionManager caches and refreshes resolved sessions", async () => {
  const calls: string[] = [];
  const manager = new ProviderSessionManager({
    resolve: async () => {
      const token = calls.length === 0 ? "token-1" : "token-2";
      calls.push(token);

      return {
        credential: {
          kind: "session-token",
          value: token,
        },
        endpoints: {
          api: "https://dynamic.example",
        },
      };
    },
  });

  const first = await manager.resolve();
  const second = await manager.resolve();
  manager.invalidate();
  const third = await manager.resolve();

  assert.equal(first.credential.value, "token-1");
  assert.equal(second.credential.value, "token-1");
  assert.equal(third.credential.value, "token-2");
});

test("prepareProviderRequest attaches the resolved session and applies mutators", async () => {
  const manager = new ProviderSessionManager({
    resolve: async () => {
      return {
        credential: {
          kind: "session-token",
          value: "token-1",
        },
        endpoints: {
          api: "https://dynamic.example",
        },
      };
    },
  });
  const requestMutator: ProviderRequestMutator = async (preparedRequest) => {
    return {
      ...preparedRequest,
      request: {
        ...preparedRequest.request,
        max_tokens: 222,
      },
    };
  };

  const request = createRequest();
  const prepared = await prepareProviderRequest(request, {
    sessionManager: manager,
    requestMutators: [requestMutator],
  });

  assert.notEqual(prepared.request, request);
  assert.equal(prepared.request.max_tokens, 222);
  assert.equal(prepared.session?.credential.value, "token-1");
  assert.equal(prepared.session?.endpoints?.api, "https://dynamic.example");
});
