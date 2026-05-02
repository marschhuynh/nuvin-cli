import { ChatModel } from "@nuvin/nuvin-core/models";
import { describe, expect, it, vi } from "vitest";

import { createChatModelFromConfig, createChatModelFromEnv } from "#src/lib/chat/model.js";

describe("createChatModelFromConfig", () => {
  it("creates a model from centralized config provider auth", () => {
    const { chatModel, modelName } = createChatModelFromConfig({
      activeProvider: "zai",
      activeModel: "glm-4.7",
      providers: {
        zai: {
          auth: [{ type: "apiKey", apiKey: "test-key", authScheme: "bearer" }],
          currentAuth: "apiKey",
          baseUrl: "https://api.z.ai/api/anthropic",
          surface: "anthropic-messages",
        },
      },
    });

    expect(chatModel).toBeInstanceOf(ChatModel);
    expect(chatModel.model).toBe("glm-4.7");
    expect(modelName).toBe("glm-4.7");
  });

  it("falls back to top-level apiKey when no provider is active", () => {
    const { chatModel } = createChatModelFromConfig({
      apiKey: "top-level-key",
    });

    expect(chatModel).toBeInstanceOf(ChatModel);
    expect(chatModel.model).toBe("glm-4.7");
  });

  it("throws when no api key can be resolved", () => {
    expect(() => createChatModelFromConfig({})).toThrow(/api key/i);
  });
});

describe("createChatModelFromEnv", () => {
  it("keeps existing API_KEY compatibility", () => {
    vi.stubEnv("API_KEY", "test-key");

    const { chatModel, modelName } = createChatModelFromEnv();

    expect(chatModel).toBeInstanceOf(ChatModel);
    expect(chatModel.model).toBe("glm-4.7");
    expect(modelName).toBe("glm-4.7");

    vi.unstubAllEnvs();
  });

  it("throws when API_KEY is missing", () => {
    vi.stubEnv("API_KEY", undefined);

    expect(() => createChatModelFromEnv()).toThrow(/api key/i);

    vi.unstubAllEnvs();
  });
});
