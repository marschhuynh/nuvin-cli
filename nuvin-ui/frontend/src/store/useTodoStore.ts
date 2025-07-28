import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TodoItem, TodoStats } from '@/types';

interface TodoState {
  // Store todos grouped by conversation ID
  todos: Record<string, TodoItem[]>; // conversationId -> TodoItem[]
  globalTodos: TodoItem[]; // Todos not associated with any conversation

  // Actions
  addTodo: (todo: Omit<TodoItem, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTodo: (todoId: string, updates: Partial<TodoItem>) => void;
  deleteTodo: (todoId: string) => void;
  clearTodos: (conversationId?: string) => void;

  // Bulk actions
  setTodos: (todos: TodoItem[], conversationId?: string) => void;
  moveTodoToConversation: (todoId: string, conversationId?: string) => void;

  // Query methods
  getTodos: (conversationId?: string) => TodoItem[];
  getTodoById: (todoId: string) => TodoItem | null;
  getTodoStats: (conversationId?: string) => TodoStats;
  getAllTodos: () => TodoItem[];

  // Utility methods
  markAsInProgress: (todoId: string) => void;
  markAsCompleted: (todoId: string) => void;
  markAsPending: (todoId: string) => void;
  
  reset: () => void;
}

const generateId = (): string => {
  return `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const calculateStats = (todos: TodoItem[]): TodoStats => {
  return {
    total: todos.length,
    pending: todos.filter(t => t.status === 'pending').length,
    inProgress: todos.filter(t => t.status === 'in_progress').length,
    completed: todos.filter(t => t.status === 'completed').length,
    highPriority: todos.filter(t => t.priority === 'high').length,
    mediumPriority: todos.filter(t => t.priority === 'medium').length,
    lowPriority: todos.filter(t => t.priority === 'low').length,
  };
};

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      todos: {},
      globalTodos: [],

      addTodo: (todoData) => {
        const id = generateId();
        const now = new Date().toISOString();
        const newTodo: TodoItem = {
          ...todoData,
          id,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => {
          if (todoData.conversationId) {
            return {
              ...state,
              todos: {
                ...state.todos,
                [todoData.conversationId]: [
                  ...(state.todos[todoData.conversationId] || []),
                  newTodo,
                ],
              },
            };
          } else {
            return {
              ...state,
              globalTodos: [...state.globalTodos, newTodo],
            };
          }
        });

        return id;
      },

      updateTodo: (todoId, updates) => {
        const now = new Date().toISOString();
        const updatesWithTimestamp = { ...updates, updatedAt: now };

        set((state) => {
          // Try to find in global todos first
          const globalIndex = state.globalTodos.findIndex(t => t.id === todoId);
          if (globalIndex !== -1) {
            const updatedGlobalTodos = [...state.globalTodos];
            updatedGlobalTodos[globalIndex] = {
              ...updatedGlobalTodos[globalIndex],
              ...updatesWithTimestamp,
            };
            return { ...state, globalTodos: updatedGlobalTodos };
          }

          // Search in conversation todos
          const newTodos = { ...state.todos };
          for (const conversationId in newTodos) {
            const todoIndex = newTodos[conversationId].findIndex(t => t.id === todoId);
            if (todoIndex !== -1) {
              const updatedConversationTodos = [...newTodos[conversationId]];
              updatedConversationTodos[todoIndex] = {
                ...updatedConversationTodos[todoIndex],
                ...updatesWithTimestamp,
              };
              newTodos[conversationId] = updatedConversationTodos;
              break;
            }
          }

          return { ...state, todos: newTodos };
        });
      },

      deleteTodo: (todoId) => {
        set((state) => {
          // Try to remove from global todos first
          const globalIndex = state.globalTodos.findIndex(t => t.id === todoId);
          if (globalIndex !== -1) {
            return {
              ...state,
              globalTodos: state.globalTodos.filter(t => t.id !== todoId),
            };
          }

          // Search and remove from conversation todos
          const newTodos = { ...state.todos };
          for (const conversationId in newTodos) {
            const todoIndex = newTodos[conversationId].findIndex(t => t.id === todoId);
            if (todoIndex !== -1) {
              newTodos[conversationId] = newTodos[conversationId].filter(t => t.id !== todoId);
              break;
            }
          }

          return { ...state, todos: newTodos };
        });
      },

      clearTodos: (conversationId) => {
        set((state) => {
          if (conversationId) {
            return {
              ...state,
              todos: {
                ...state.todos,
                [conversationId]: [],
              },
            };
          } else {
            return {
              ...state,
              globalTodos: [],
            };
          }
        });
      },

      setTodos: (todos, conversationId) => {
        const now = new Date().toISOString();
        const todosWithTimestamp = todos.map(todo => ({
          ...todo,
          updatedAt: now,
          conversationId: conversationId || todo.conversationId,
        }));

        set((state) => {
          if (conversationId) {
            return {
              ...state,
              todos: {
                ...state.todos,
                [conversationId]: todosWithTimestamp,
              },
            };
          } else {
            return {
              ...state,
              globalTodos: todosWithTimestamp,
            };
          }
        });
      },

      moveTodoToConversation: (todoId, conversationId) => {
        set((state) => {
          let todoToMove: TodoItem | null = null;
          let sourceIsGlobal = false;
          let sourceConversationId: string | null = null;

          // Find the todo to move
          const globalIndex = state.globalTodos.findIndex(t => t.id === todoId);
          if (globalIndex !== -1) {
            todoToMove = state.globalTodos[globalIndex];
            sourceIsGlobal = true;
          } else {
            for (const convId in state.todos) {
              const todoIndex = state.todos[convId].findIndex(t => t.id === todoId);
              if (todoIndex !== -1) {
                todoToMove = state.todos[convId][todoIndex];
                sourceConversationId = convId;
                break;
              }
            }
          }

          if (!todoToMove) return state;

          // Update the todo with new conversation ID
          const updatedTodo = {
            ...todoToMove,
            conversationId,
            updatedAt: new Date().toISOString(),
          };

          // Remove from source
          let newState = { ...state };
          if (sourceIsGlobal) {
            newState.globalTodos = state.globalTodos.filter(t => t.id !== todoId);
          } else if (sourceConversationId) {
            newState.todos = {
              ...state.todos,
              [sourceConversationId]: state.todos[sourceConversationId].filter(t => t.id !== todoId),
            };
          }

          // Add to destination
          if (conversationId) {
            newState.todos = {
              ...newState.todos,
              [conversationId]: [...(newState.todos[conversationId] || []), updatedTodo],
            };
          } else {
            newState.globalTodos = [...newState.globalTodos, { ...updatedTodo, conversationId: undefined }];
          }

          return newState;
        });
      },

      getTodos: (conversationId) => {
        const state = get();
        return conversationId 
          ? (state.todos[conversationId] || [])
          : state.globalTodos;
      },

      getTodoById: (todoId) => {
        const state = get();
        
        // Search in global todos
        const globalTodo = state.globalTodos.find(t => t.id === todoId);
        if (globalTodo) return globalTodo;

        // Search in conversation todos
        for (const conversationId in state.todos) {
          const todo = state.todos[conversationId].find(t => t.id === todoId);
          if (todo) return todo;
        }

        return null;
      },

      getTodoStats: (conversationId) => {
        const state = get();
        const todos = conversationId 
          ? (state.todos[conversationId] || [])
          : state.globalTodos;
        return calculateStats(todos);
      },

      getAllTodos: () => {
        const state = get();
        const allTodos = [...state.globalTodos];
        
        for (const conversationId in state.todos) {
          allTodos.push(...state.todos[conversationId]);
        }
        
        return allTodos;
      },

      markAsInProgress: (todoId) => {
        get().updateTodo(todoId, { status: 'in_progress' });
      },

      markAsCompleted: (todoId) => {
        get().updateTodo(todoId, { status: 'completed' });
      },

      markAsPending: (todoId) => {
        get().updateTodo(todoId, { status: 'pending' });
      },

      reset: () => {
        set({
          todos: {},
          globalTodos: [],
        });
      },
    }),
    {
      name: 'todo-storage',
    },
  ),
);