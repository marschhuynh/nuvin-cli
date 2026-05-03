import assert from "node:assert/strict";
import { test } from "vitest";

import { Agent, createExtensionRegistry, runTurn } from "./agent/index.ts";
import { normalizeMessage, toChatRequest } from "./formats/index.ts";
import { ChatModel } from "./models/index.ts";
import { type ChatRequest, resolveOpenAiReasoningConfig } from "./shared/index.ts";
import {
  createBashTool,
  createFileEditTool,
  createFileNewTool,
  createFileReadTool,
  createGlobTool,
  createGrepTool,
  createInternalToolRuntime,
  createLsTool,
  defineTool,
} from "./tools/index.ts";

test("public barrels export the main library surface", () => {
  assert.equal(typeof Agent, "function");
  assert.equal(typeof createExtensionRegistry, "function");
  assert.equal(typeof runTurn, "function");
  assert.equal(typeof normalizeMessage, "function");
  assert.equal(typeof toChatRequest, "function");
  assert.equal(typeof ChatModel, "function");
  assert.equal(typeof defineTool, "function");
  assert.equal(typeof createBashTool, "function");
  assert.equal(typeof createFileEditTool, "function");
  assert.equal(typeof createFileNewTool, "function");
  assert.equal(typeof createFileReadTool, "function");
  assert.equal(typeof createGlobTool, "function");
  assert.equal(typeof createGrepTool, "function");
  assert.equal(typeof createInternalToolRuntime, "function");
  assert.equal(typeof createLsTool, "function");
  assert.equal(typeof resolveOpenAiReasoningConfig, "function");
});

test("public barrels export usable shared types", () => {
  const request: ChatRequest = {
    model: "test-model",
    maxTokens: 128,
    system: [],
    messages: [],
    tools: [],
    metadata: {
      sessionId: "session-1",
      turnId: "turn-1",
    },
  };

  assert.equal(request.metadata.sessionId, "session-1");
});
