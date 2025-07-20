import { ProviderConfig, AgentSettings, Message } from "@/types";
import {
  createProvider,
  ChatMessage,
  LLMProviderConfig,
  ProviderType,
} from "../providers";
import { generateUUID } from "../utils";
import { BaseAgent } from "./base-agent";
import type { SendMessageOptions, MessageResponse } from "../agent-manager";
import { toolIntegrationService } from "../tools";
import type { ToolContext } from "@/types/tools";

// Convert from existing ProviderConfig to our LLMProviderConfig
function convertToLLMProviderConfig(config: ProviderConfig): LLMProviderConfig {
  return {
    type: config.type as ProviderType,
    apiKey: config.apiKey,
    name: config.name,
  };
}

export class LocalAgent extends BaseAgent {
  constructor(
    agentSettings: AgentSettings,
    private providerConfig: ProviderConfig,
    history: Map<string, Message[]>
  ) {
    super(agentSettings, history);
  }

  async sendMessage(
    content: string,
    options: SendMessageOptions = {}
  ): Promise<MessageResponse> {
    const startTime = Date.now();
    const messageId = generateUUID();
    const provider = createProvider(
      convertToLLMProviderConfig(this.providerConfig)
    );
    const convoId = options.conversationId || "default";
    const messages: ChatMessage[] = this.buildContext(convoId, content);

    // Create tool context for tool execution
    const toolContext: ToolContext = {
      userId: options.userId,
      sessionId: convoId,
      metadata: {
        agentId: this.agentSettings.id,
        provider: this.providerConfig.type,
        model: this.providerConfig.activeModel.model,
      },
    };

    // Prepare base completion parameters
    const baseParams = {
      messages,
      model: this.providerConfig.activeModel.model,
      temperature: this.agentSettings.temperature,
      maxTokens: this.providerConfig.activeModel.maxTokens,
      topP: this.agentSettings.topP,
    };

    // Enhance with tools if configured
    const enhancedParams = toolIntegrationService.enhanceCompletionParams(
      baseParams,
      this.agentSettings.toolConfig
    );

    if (options.stream && provider.generateCompletionStream) {
      // Note: Tool calling with streaming is complex and typically not supported
      // Fall back to non-streaming if tools are enabled
      if (this.agentSettings.toolConfig?.enabledTools?.length) {
        console.warn(
          "Tool calling detected - falling back to non-streaming mode"
        );
        return this.sendMessage(content, { ...options, stream: false });
      }

      let accumulated = "";
      console.log("Streaming message", content, messages);
      const stream = provider.generateCompletionStream(enhancedParams);

      for await (const chunk of stream) {
        accumulated += chunk;
        options.onChunk?.(chunk);
      }

      const timestamp = new Date().toISOString();
      const response: MessageResponse = {
        id: messageId,
        content: accumulated,
        role: "assistant",
        timestamp,
        metadata: {
          agentType: "local",
          agentId: this.agentSettings.id,
          provider: this.providerConfig.type,
          model: this.providerConfig.activeModel.model,
          responseTime: Date.now() - startTime,
        },
      };

      this.addToHistory(convoId, [
        { id: generateUUID(), role: "user", content, timestamp },
        {
          id: generateUUID(),
          role: "assistant",
          content: accumulated,
          timestamp,
        },
      ]);

      options.onComplete?.(accumulated);
      return response;
    }

    // Get initial completion (potentially with tool calls)
    const result = await provider.generateCompletion(enhancedParams);

    // Process any tool calls
    const processed = await toolIntegrationService.processCompletionResult(
      result,
      toolContext,
      this.agentSettings.toolConfig
    );

    let finalResult = result;

    // If tools were called, get the final response
    if (processed.requiresFollowUp && processed.toolCalls) {
      finalResult = await toolIntegrationService.completeToolCallingFlow(
        enhancedParams,
        result,
        processed.toolCalls,
        provider,
        toolContext,
        this.agentSettings.toolConfig
      );
    }

    const timestamp = new Date().toISOString();
    const response: MessageResponse = {
      id: messageId,
      content: finalResult.content,
      role: "assistant",
      timestamp,
      metadata: {
        agentType: "local",
        agentId: this.agentSettings.id,
        provider: this.providerConfig.type,
        model: this.providerConfig.activeModel.model,
        responseTime: Date.now() - startTime,
        toolCalls: processed.toolCalls?.length || 0,
      },
    };

    this.addToHistory(convoId, [
      { id: generateUUID(), role: "user", content, timestamp },
      {
        id: generateUUID(),
        role: "assistant",
        content: finalResult.content,
        timestamp,
      },
    ]);

    options.onComplete?.(finalResult.content);
    return response;
  }
}
