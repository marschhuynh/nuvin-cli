import { AgentSettings, Message } from '@/types';
import { a2aService, A2AAuthConfig, A2AMessageOptions, A2AError } from '../a2a';
import { BaseAgent } from './base-agent';
import { generateUUID } from '../utils';
import type { SendMessageOptions, MessageResponse } from '../agent-manager';
import type { Task, Message as A2AMessage, Part } from '../a2a';

export class A2AAgent extends BaseAgent {
  constructor(settings: AgentSettings, history: Map<string, Message[]>) {
    super(settings, history);
  }

  private createAuthConfig(): A2AAuthConfig | undefined {
    if (!this.settings.auth) return undefined;
    return {
      type: this.settings.auth.type,
      token: this.settings.auth.token,
      username: this.settings.auth.username,
      password: this.settings.auth.password,
      headerName: this.settings.auth.headerName
    };
  }

  async sendMessage(content: string, options: SendMessageOptions = {}): Promise<MessageResponse> {
    if (!this.settings.url) {
      throw new Error('No URL configured for remote agent');
    }

    const startTime = Date.now();
    const messageId = generateUUID();
    const timestamp = new Date().toISOString();
    const authConfig = this.createAuthConfig();
    const a2aOptions: A2AMessageOptions = {
      contextId: options.contextId,
      taskId: options.taskId,
      blocking: !options.stream,
      acceptedOutputModes: ['text'],
      timeout: options.timeout,
      enableRetry: options.enableRetry,
      maxRetries: options.maxRetries
    };

    try {
      if (options.stream && options.onChunk) {
        return await this.sendStreamingMessage(content, options, messageId, timestamp, startTime, authConfig, a2aOptions);
      }

      const response = await a2aService.sendMessage(this.settings.url, content, authConfig, a2aOptions);

      let finalResponse = response;
      if (response.kind === 'task' && response.status.state === 'working') {
        finalResponse = await this.pollForTaskCompletion(this.settings.url, response.id, authConfig, options.timeout || 60000);
      }

      const responseContent = this.extractResponseContent(finalResponse);

      options.onComplete?.(responseContent);

      this.addToHistory(options.conversationId || 'default', [
        { id: generateUUID(), role: 'user', content, timestamp },
        { id: generateUUID(), role: 'assistant', content: responseContent, timestamp: new Date().toISOString() }
      ]);

      return {
        id: messageId,
        content: responseContent,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        metadata: {
          agentType: 'remote',
          agentId: this.settings.id,
          responseTime: Date.now() - startTime,
          model: 'A2A Agent',
          taskId: finalResponse.kind === 'task' ? finalResponse.id : undefined
        }
      };
    } catch (error) {
      if (error instanceof A2AError) {
        throw new Error(error.getUserMessage());
      }
      throw error;
    }
  }

  private async pollForTaskCompletion(agentUrl: string, taskId: string, authConfig: A2AAuthConfig | undefined, totalTimeout: number): Promise<Task> {
    const startTime = Date.now();
    let pollInterval = 1000;
    const maxInterval = 5000;

    while (Date.now() - startTime < totalTimeout) {
      try {
        const task = await a2aService.getTask(agentUrl, taskId, authConfig);
        if (!task) throw new Error(`Task ${taskId} not found`);
        if (task.status.state === 'completed' || ['failed', 'canceled', 'input-required'].includes(task.status.state)) {
          return task;
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollInterval = Math.min(pollInterval * 1.5, maxInterval);
      } catch {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    return await a2aService.getTask(agentUrl, taskId, authConfig);
  }

  private extractResponseContent(response: Task | A2AMessage): string {
    if (response.kind === 'message') {
      return response.parts.filter((p: Part) => p.kind === 'text').map((p: any) => p.text).join('\n') || 'No response content';
    }
    if (response.status.message?.parts) {
      const statusText = response.status.message.parts.filter((p: Part) => p.kind === 'text').map((p: any) => p.text).join('\n');
      if (statusText) return statusText;
    }
    for (const artifact of response.artifacts || []) {
      for (const part of artifact.parts) {
        if (part.kind === 'text') return part.text;
      }
    }
    return 'No response content';
  }

  private async sendStreamingMessage(
    content: string,
    options: SendMessageOptions,
    messageId: string,
    timestamp: string,
    startTime: number,
    authConfig: A2AAuthConfig | undefined,
    a2aOptions: A2AMessageOptions
  ): Promise<MessageResponse> {
    if (!this.settings.url) {
      throw new Error('No URL configured for remote agent');
    }

    let accumulated = '';
    let finalTimestamp = new Date().toISOString();
    let taskId: string | undefined;

    const stream = a2aService.sendMessageStream(this.settings.url, content, authConfig, a2aOptions);

    for await (const event of stream) {
      if (event.kind === 'task') {
        taskId = event.id;
        if (event.artifacts) {
          for (const artifact of event.artifacts) {
            for (const part of artifact.parts) {
              if (part.kind === 'text') {
                const newContent = part.text;
                if (newContent !== accumulated) {
                  const chunk = newContent.substring(accumulated.length);
                  accumulated = newContent;
                  options.onChunk?.(chunk);
                }
              }
            }
          }
        }
        if (event.status.state === 'completed') {
          finalTimestamp = event.status.timestamp || finalTimestamp;
          break;
        }
      } else if (event.kind === 'message') {
        for (const part of event.parts) {
          if (part.kind === 'text') {
            accumulated += part.text;
            options.onChunk?.(part.text);
          }
        }
      } else if (event.kind === 'artifact-update') {
        for (const part of event.artifact.parts) {
          if (part.kind === 'text') {
            if (event.append) {
              accumulated += part.text;
            } else {
              accumulated = part.text;
            }
            options.onChunk?.(part.text);
          }
        }
      }
    }

    options.onComplete?.(accumulated);

    this.addToHistory(options.conversationId || 'default', [
      { id: generateUUID(), role: 'user', content, timestamp },
      { id: generateUUID(), role: 'assistant', content: accumulated, timestamp: finalTimestamp }
    ]);

    return {
      id: messageId,
      content: accumulated || 'No response content received',
      role: 'assistant',
      timestamp: finalTimestamp,
      metadata: {
        agentType: 'remote',
        agentId: this.settings.id,
        responseTime: Date.now() - startTime,
        model: 'A2A Agent (Streaming)',
        taskId
      }
    };
  }
}
