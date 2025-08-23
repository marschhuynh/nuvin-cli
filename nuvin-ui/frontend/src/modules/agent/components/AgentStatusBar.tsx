import { useEffect, useState } from 'react';
import { useAgentManager } from '@/hooks';
import { useConversationStore } from '@/store';

interface ConversationMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  messageCount: number;
}

interface AgentStatusBarProps {
  activeConversationId?: string | null;
}

export function AgentStatusBar({ activeConversationId }: AgentStatusBarProps) {
  const { activeAgent, isReady } = useAgentManager();
  const { getConversationMessages } = useConversationStore();

  // State for conversation metrics
  const [conversationMetrics, setConversationMetrics] = useState<ConversationMetrics | null>(null);

  const messages = activeConversationId ? getConversationMessages(activeConversationId) : [];

  // Update conversation metrics when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      // const messages = getConversationMessages(activeConversationId);
      let totalTokens = 0;
      let promptTokens = 0;
      let completionTokens = 0;
      let totalCost = 0;
      let messageCount = 0;

      messages.forEach((message) => {
        if (message.role === 'assistant' && message.metadata) {
          const metadata = message.metadata;
          totalTokens += metadata.totalTokens || 0;
          promptTokens += metadata.promptTokens || 0;
          completionTokens += metadata.completionTokens || 0;
          totalCost += metadata.estimatedCost || 0;
          messageCount++;
        }
      });

      setConversationMetrics({
        totalTokens,
        promptTokens,
        completionTokens,
        totalCost,
        messageCount,
      });
    } else {
      setConversationMetrics(null);
    }
  }, [activeConversationId, messages.forEach]);

  console.log('Conversation Metrics:', messages?.[messages.length - 1]?.metadata);

  // Format numbers for display
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return '<$0.01';
    return `$${cost.toFixed(2)}`;
  };

  return (
    <div className="border-t border-border bg-card px-6 py-2">
      <div className="max-w-4xl mx-auto flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <div
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              isReady ? 'bg-green-500 shadow-sm shadow-green-500/30' : 'bg-red-500 shadow-sm shadow-red-500/30'
            }`}
          />
          <span className="text-xs font-medium text-muted-foreground transition-colors duration-200">
            Agent: {activeAgent?.name || 'None'}
          </span>
          {isReady && (
            <span className="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-600 rounded-md transition-all duration-200">
              Ready
            </span>
          )}
        </div>

        {/* Conversation Metrics */}
        {conversationMetrics && activeConversationId && (
          <div className="flex items-center gap-2 text-xs">
            {/* Token Breakdown */}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md">
              <div className="flex items-center gap-1">
                <div className="w-1 h-1 bg-orange-400 rounded-full"></div>
                <span className="text-orange-600 font-medium">{formatNumber(conversationMetrics.promptTokens)}</span>
              </div>
              <span className="text-gray-400">→</span>
              <div className="flex items-center gap-1">
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                <span className="text-blue-600 font-medium">{formatNumber(conversationMetrics.completionTokens)}</span>
              </div>
            </div>

            {/* Cost Display */}
            <div className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-md">
              <div className="w-1 h-1 bg-green-500 rounded-full"></div>
              <span className="font-medium">{formatCost(conversationMetrics.totalCost)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
