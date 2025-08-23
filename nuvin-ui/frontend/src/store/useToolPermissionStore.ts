import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PermissionRequest {
  conversationId: string;
  toolName: string;
  // Optional parameters of the current tool call for display
  toolParams?: Record<string, unknown>;
  resolve: (decision: 'once' | 'conversation' | 'deny') => void;
}

interface ToolPermissionState {
  permissions: Record<string, string[]>; // conversationId -> allowed tool names
  request: PermissionRequest | null;
  requestQueue: PermissionRequest[];
  isToolAllowed: (conversationId: string, toolName: string) => boolean;
  allowForConversation: (conversationId: string, toolName: string) => void;
  askPermission: (
    conversationId: string,
    toolName: string,
    toolParams?: Record<string, unknown>,
  ) => Promise<'once' | 'conversation' | 'deny'>;
  resolveRequest: (decision: 'once' | 'conversation' | 'deny') => void;
}

export const useToolPermissionStore = create<ToolPermissionState>()(
  persist(
    (set, get) => ({
      permissions: {},
      request: null,
      requestQueue: [],
      isToolAllowed: (conversationId, toolName) => {
        const allowed = get().permissions[conversationId] || [];
        return allowed.includes(toolName);
      },
      allowForConversation: (conversationId, toolName) =>
        set((state) => {
          const convPerms = new Set(state.permissions[conversationId] || []);
          convPerms.add(toolName);
          return {
            permissions: {
              ...state.permissions,
              [conversationId]: Array.from(convPerms),
            },
          };
        }),
      askPermission: (conversationId, toolName, toolParams) =>
        new Promise<'once' | 'conversation' | 'deny'>((resolve) => {
          const newRequest = { conversationId, toolName, toolParams, resolve };
          
          set((state) => {
            // If no current request, show this one immediately
            if (!state.request) {
              return { 
                ...state,
                request: newRequest,
                requestQueue: [...state.requestQueue]
              };
            } else {
              // Otherwise, queue it
              return {
                ...state,
                requestQueue: [...state.requestQueue, newRequest]
              };
            }
          });
        }),
      resolveRequest: (decision) => {
        const req = get().request;
        if (req) {
          req.resolve(decision);
        }
        
        set((state) => {
          // Process next request in queue if any
          const nextRequest = state.requestQueue[0];
          const remainingQueue = state.requestQueue.slice(1);
          
          return {
            ...state,
            request: nextRequest || null,
            requestQueue: remainingQueue
          };
        });
      },
    }),
    {
      name: 'tool-permission-storage',
      partialize: (state) => ({ permissions: state.permissions }),
    },
  ),
);;
