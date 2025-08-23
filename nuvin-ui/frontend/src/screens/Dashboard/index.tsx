import { startTransition, useCallback } from 'react';
import { ConversationHistory } from '@/components';
import { generateUUID } from '@/lib/utils';
import { createTimestamp } from '@/lib/timestamp';
import { useConversationStore } from '@/store';
import type { Conversation } from '@/types';

import { AgentConfiguration } from '../../modules/agent/AgentConfiguration';
import Messenger from './messenger';

export default function Dashboard() {
  // Use conversation store
  const { activeConversationId, addConversation, setActiveConversation, deleteConversation } = useConversationStore();

  const handleNewConversation = useCallback(() => {
    const newConversation: Conversation = {
      id: generateUUID(),
      title: 'New Conversation',
      timestamp: createTimestamp(),
      active: true,
    };

    // Add new conversation (automatically becomes active)
    addConversation(newConversation);
  }, [
    // Add new conversation (automatically becomes active)
    addConversation,
  ]);

  const handleConversationSelect = useCallback(
    (conversationId: string) => {
      // Set the selected conversation as active
      setActiveConversation(conversationId);
    },
    [
      // Set the selected conversation as active
      setActiveConversation,
    ],
  );

  const handleConversationDelete = useCallback(
    (conversationId: string) => {
      startTransition(() => {
        if (conversationId === activeConversationId) {
          setActiveConversation('');
        }
        deleteConversation(conversationId);
      });
    },
    [activeConversationId, deleteConversation, setActiveConversation],
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      <ConversationHistory
        onNewConversation={handleNewConversation}
        onConversationSelect={handleConversationSelect}
        onConversationDelete={handleConversationDelete}
      />

      <Messenger />

      <AgentConfiguration />
    </div>
  );
}
