import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Conversation, Message } from '@/types'

interface ConversationState {
  conversations: Conversation[]
  messages: Record<string, Message[]> // Messages grouped by conversation ID
  activeConversationId: string | null

  // Conversation actions
  addConversation: (conversation: Conversation) => void
  updateConversation: (conversation: Conversation) => void
  deleteConversation: (id: string) => void
  setActiveConversation: (id: string) => void

  // Message actions
  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (conversationId: string, message: Message) => void
  deleteMessage: (conversationId: string, messageId: string) => void
  clearMessages: (conversationId: string) => void

  // Utility methods
  getActiveConversation: () => Conversation | null
  getActiveMessages: () => Message[]
  getConversationMessages: (conversationId: string) => Message[]

  reset: () => void
  _syncActiveState: () => void
}

const defaultConversations: Conversation[] = []

const defaultMessages: Record<string, Message[]> = {}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      conversations: defaultConversations,
      messages: defaultMessages,
      activeConversationId: null,

      // Conversation actions
      addConversation: (conversation) =>
        set((state) => ({
          conversations: [
            { ...conversation, active: true }, // Make new conversation active
            ...state.conversations.map(c => ({ ...c, active: false })) // Make all others inactive
          ],
          messages: { ...state.messages, [conversation.id]: [] },
          activeConversationId: conversation.id
        })),

      updateConversation: (conversation) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversation.id ? conversation : c
          )
        })),

      deleteConversation: (id) =>
        set((state) => {
          const newMessages = { ...state.messages }
          delete newMessages[id]
          return {
            conversations: state.conversations.filter((c) => c.id !== id),
            messages: newMessages,
            activeConversationId: state.activeConversationId === id ? null : state.activeConversationId
          }
        }),

      setActiveConversation: (id) =>
        set((state) => ({
          conversations: state.conversations.map((c) => ({
            ...c,
            active: c.id === id
          })),
          activeConversationId: id
        })),

      // Message actions
      addMessage: (conversationId, message) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: [...(state.messages[conversationId] || []), message]
          }
        })),

      updateMessage: (conversationId, message) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] || []).map((m) =>
              m.id === message.id ? message : m
            )
          }
        })),

      deleteMessage: (conversationId, messageId) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] || []).filter((m) => m.id !== messageId)
          }
        })),

      clearMessages: (conversationId) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: []
          }
        })),

      // Utility methods
      getActiveConversation: () => {
        const state = get()
        return state.conversations.find(c => c.id === state.activeConversationId) || null
      },

      getActiveMessages: () => {
        const state = get()
        return state.activeConversationId ? state.messages[state.activeConversationId] || [] : []
      },

      getConversationMessages: (conversationId) => {
        const state = get()
        return state.messages[conversationId] || []
      },

      reset: () => set({
        conversations: defaultConversations,
        messages: defaultMessages,
        activeConversationId: null
      }),

      // Internal method to ensure consistency after hydration
      _syncActiveState: () =>
        set((state) => {
          const activeId = state.activeConversationId;
          if (!activeId) return state;

          return {
            ...state,
            conversations: state.conversations.map((c) => ({
              ...c,
              active: c.id === activeId
            }))
          };
        })
    }),
    {
      name: 'conversation-storage',
      // Ensure consistency after rehydration
      onRehydrateStorage: () => (state) => {
        if (state?._syncActiveState) {
          state._syncActiveState();
        }
      }
    }
  )
)