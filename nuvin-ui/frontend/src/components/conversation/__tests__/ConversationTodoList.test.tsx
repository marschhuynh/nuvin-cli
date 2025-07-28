import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationTodoList } from '../ConversationTodoList';

// Mock the stores with proper implementations
vi.mock('@/store/useConversationStore', () => ({
  useConversationStore: vi.fn(),
}));

vi.mock('@/store/useTodoStore', () => ({
  useTodoStore: vi.fn(),
}));

// Import the mocked modules for type safety
import { useConversationStore } from '@/store/useConversationStore';
import { useTodoStore } from '@/store/useTodoStore';

describe('ConversationTodoList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when no active conversation', () => {
    // Mock the conversation store to return no active conversation
    vi.mocked(useConversationStore).mockReturnValue({
      activeConversationId: null,
    } as any);
    
    // Mock the todo store
    vi.mocked(useTodoStore).mockReturnValue({
      getTodos: vi.fn(() => []),
      getTodoStats: vi.fn(() => ({ total: 0, pending: 0, inProgress: 0, completed: 0, highPriority: 0, mediumPriority: 0, lowPriority: 0 })),
    } as any);

    const { container } = render(<ConversationTodoList />);
    expect(container.firstChild).toBeNull();
  });

  it('should not render when no todos exist', () => {
    // Mock the conversation store to return an active conversation
    vi.mocked(useConversationStore).mockReturnValue({
      activeConversationId: 'test-conversation',
    } as any);
    
    // Mock the todo store to return empty todos
    vi.mocked(useTodoStore).mockReturnValue({
      getTodos: vi.fn(() => []),
      getTodoStats: vi.fn(() => ({ total: 0, pending: 0, inProgress: 0, completed: 0, highPriority: 0, mediumPriority: 0, lowPriority: 0 })),
    } as any);
    
    const { container } = render(<ConversationTodoList />);
    expect(container.firstChild).toBeNull();
  });

  it('should render todo list when todos exist', () => {
    const mockTodos = [
      {
        id: '1',
        content: 'Test todo 1',
        status: 'pending' as const,
        priority: 'high' as const,
        conversationId: 'test-conversation',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
      {
        id: '2',
        content: 'Test todo 2',
        status: 'completed' as const,
        priority: 'medium' as const,
        conversationId: 'test-conversation',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ];

    const mockStats = {
      total: 2,
      pending: 1,
      inProgress: 0,
      completed: 1,
      highPriority: 1,
      mediumPriority: 1,
      lowPriority: 0,
    };

    // Mock the conversation store
    vi.mocked(useConversationStore).mockReturnValue({
      activeConversationId: 'test-conversation',
    } as any);
    
    // Mock the todo store
    vi.mocked(useTodoStore).mockReturnValue({
      getTodos: vi.fn(() => mockTodos),
      getTodoStats: vi.fn(() => mockStats),
    } as any);

    render(<ConversationTodoList />);

    // Should show the todo list header
    expect(screen.getByText('Todo List')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument(); // Stats display
  });

  it('should auto-expand when there are uncompleted items', () => {
    const mockTodos = [
      {
        id: '1',
        content: 'Test todo 1',
        status: 'pending' as const,
        priority: 'high' as const,
        conversationId: 'test-conversation',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ];

    // Mock the conversation store
    vi.mocked(useConversationStore).mockReturnValue({
      activeConversationId: 'test-conversation',
    } as any);
    
    // Mock the todo store
    vi.mocked(useTodoStore).mockReturnValue({
      getTodos: vi.fn(() => mockTodos),
      getTodoStats: vi.fn(() => ({
        total: 1,
        pending: 1,
        inProgress: 0,
        completed: 0,
        highPriority: 1,
        mediumPriority: 0,
        lowPriority: 0,
      })),
    } as any);

    render(<ConversationTodoList />);

    // Should be expanded by default since there are uncompleted items
    expect(screen.getByText('Test todo 1')).toBeInTheDocument();
  });

  it('should not auto-expand when all items are completed', () => {
    const mockTodos = [
      {
        id: '1',
        content: 'Test todo 1',
        status: 'completed' as const,
        priority: 'high' as const,
        conversationId: 'test-conversation',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ];

    // Mock the conversation store
    vi.mocked(useConversationStore).mockReturnValue({
      activeConversationId: 'test-conversation',
    } as any);
    
    // Mock the todo store
    vi.mocked(useTodoStore).mockReturnValue({
      getTodos: vi.fn(() => mockTodos),
      getTodoStats: vi.fn(() => ({
        total: 1,
        pending: 0,
        inProgress: 0,
        completed: 1,
        highPriority: 1,
        mediumPriority: 0,
        lowPriority: 0,
      })),
    } as any);

    render(<ConversationTodoList />);

    // Should NOT be expanded by default since all items are completed
    expect(screen.queryByText('Test todo 1')).not.toBeInTheDocument();
    
    // But should show the header
    expect(screen.getByText('Todo List')).toBeInTheDocument();
  });

  it('should expand/collapse when clicked (completed items)', () => {
    const mockTodos = [
      {
        id: '1',
        content: 'Test todo 1',
        status: 'completed' as const,
        priority: 'high' as const,
        conversationId: 'test-conversation',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ];

    // Mock the conversation store
    vi.mocked(useConversationStore).mockReturnValue({
      activeConversationId: 'test-conversation',
    } as any);
    
    // Mock the todo store
    vi.mocked(useTodoStore).mockReturnValue({
      getTodos: vi.fn(() => mockTodos),
      getTodoStats: vi.fn(() => ({
        total: 1,
        pending: 0,
        inProgress: 0,
        completed: 1,
        highPriority: 1,
        mediumPriority: 0,
        lowPriority: 0,
      })),
    } as any);

    render(<ConversationTodoList />);

    // Initially collapsed - todo content should not be visible (all completed)
    expect(screen.queryByText('Test todo 1')).not.toBeInTheDocument();

    // Click to expand
    const header = screen.getByText('Todo List').closest('div');
    fireEvent.click(header!);

    // Now todo content should be visible
    expect(screen.getByText('Test todo 1')).toBeInTheDocument();
  });

  it('should display todo items in simplified format when auto-expanded', () => {
    const mockTodos = [
      {
        id: '1',
        content: 'Test todo 1',
        status: 'pending' as const,
        priority: 'high' as const,
        conversationId: 'test-conversation',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
      {
        id: '2',
        content: 'Test todo 2',
        status: 'completed' as const,
        priority: 'medium' as const,
        conversationId: 'test-conversation',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ];

    // Mock the conversation store
    vi.mocked(useConversationStore).mockReturnValue({
      activeConversationId: 'test-conversation',
    } as any);
    
    // Mock the todo store
    vi.mocked(useTodoStore).mockReturnValue({
      getTodos: vi.fn(() => mockTodos),
      getTodoStats: vi.fn(() => ({
        total: 2,
        pending: 1,
        inProgress: 0,
        completed: 1,
        highPriority: 1,
        mediumPriority: 1,
        lowPriority: 0,
      })),
    } as any);

    render(<ConversationTodoList />);

    // Should be auto-expanded and show todo items without progress section or priority badges
    expect(screen.getByText('Test todo 1')).toBeInTheDocument();
    expect(screen.getByText('Test todo 2')).toBeInTheDocument();
    
    // Should not show progress information
    expect(screen.queryByText('Progress')).not.toBeInTheDocument();
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
    expect(screen.queryByText('high')).not.toBeInTheDocument();
    expect(screen.queryByText('medium')).not.toBeInTheDocument();
  });
});