import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PermissionRequest {
  conversationId: string;
  toolName: string;
  resolve: (decision: 'once' | 'conversation' | 'deny') => void;
}

interface ToolPermissionState {
  permissions: Record<string, string[]>; // conversationId -> allowed tool names
  request: PermissionRequest | null;
  isToolAllowed: (conversationId: string, toolName: string) => boolean;
  allowForConversation: (conversationId: string, toolName: string) => void;
  askPermission: (
    conversationId: string,
    toolName: string,
  ) => Promise<'once' | 'conversation' | 'deny'>;
  resolveRequest: (decision: 'once' | 'conversation' | 'deny') => void;
}

export const useToolPermissionStore = create<ToolPermissionState>()(
  persist(
    (set, get) => ({
      permissions: {},
      request: null,
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
      askPermission: (conversationId, toolName) =>
        new Promise<'once' | 'conversation' | 'deny'>((resolve) => {
          set({ request: { conversationId, toolName, resolve } });
        }),
      resolveRequest: (decision) => {
        const req = get().request;
        if (req) {
          req.resolve(decision);
        }
        set({ request: null });
      },
    }),
    {
      name: 'tool-permission-storage',
      partialize: (state) => ({ permissions: state.permissions }),
    },
  ),
);

