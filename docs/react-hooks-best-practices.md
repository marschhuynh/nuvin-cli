# React Hooks & State Best Practices Guide

This document outlines modern React best practices for hooks, state management, and component patterns as of 2025.

## Table of Contents

1. [useState Best Practices](#usestate-best-practices)
2. [useEffect Best Practices](#useeffect-best-practices)
3. [Advanced Hook Patterns](#advanced-hook-patterns)
4. [State Management Strategies](#state-management-strategies)
5. [Performance Optimization](#performance-optimization)
6. [Testing Hooks](#testing-hooks)

---

## useState Best Practices

### 1. Functional Updates

Always use functional updates when the new state depends on the previous state:

```tsx
// ❌ Avoid - can cause stale closure issues
setCount(count + 1);

// ✅ Correct - always gets current value
setCount(prev => prev + 1);
```

This prevents bugs in async handlers, timeouts, and rapid clicks where state may have changed since the closure was created.

### 2. Never Mutate State Directly

React uses reference comparison to detect changes. Mutating objects/arrays bypasses this:

```tsx
// ❌ Wrong - mutates state
user.name = 'Ada';
setUser(user);

// ✅ Correct - creates new reference
setUser(prev => ({ ...prev, name: 'Ada' }));
```

For arrays:
```tsx
// ❌ Wrong
items.push(newItem);
setItems(items);

// ✅ Correct
setItems(prev => [...prev, newItem]);
```

### 3. Lazy Initialization for Expensive Defaults

Wrap expensive initialization in a function to defer execution:

```tsx
// ❌ Runs on every render
const [data, setData] = useState(expensiveComputation());

// ✅ Runs only once
const [data, setData] = useState(() => expensiveComputation());
```

Common use cases: parsing localStorage, complex calculations, parsing large JSON.

### 4. Split Unrelated State

Separate concerns into multiple state variables:

```tsx
// ✅ Better - each setter controls one concern
const [user, setUser] = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
```

This prevents unnecessary re-renders when unrelated state changes.

### 5. Call Hooks at Top Level

Never call hooks inside loops, conditions, or nested functions:

```tsx
// ❌ Breaks Rules of Hooks
if (flag) {
  const [data, setData] = useState(null);
}

// ✅ Correct - unconditional at top level
const [data, setData] = useState(null);
if (flag) {
  // use data here
}
```

---

## useEffect Best Practices

### 1. Proper Dependency Arrays

Always include all dependencies that the effect uses:

```tsx
// ❌ Missing dependency
useEffect(() => {
  console.log(count);
}, []); // count is missing!

// ✅ Correct
useEffect(() => {
  console.log(count);
}, [count]);
```

### 2. Cleanup Functions

Prevent memory leaks with cleanup:

```tsx
useEffect(() => {
  const controller = new AbortController();

  fetch(`/api/users/${id}`, { signal: controller.signal })
    .then(res => res.json())
    .then(setUser)
    .catch(() => {});

  return () => controller.abort();
}, [id]);
```

### 3. Fetch Data Pattern

Modern data fetching pattern with loading/error states:

```tsx
function UserProfile({ id }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const abort = new AbortController();

    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/users/${id}`, { signal: abort.signal });
        if (!res.ok) throw new Error('Failed');
        setUser(await res.json());
      } catch (err) {
        if (err.name !== 'AbortError') setError(err);
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => abort.abort();
  }, [id]);

  if (loading) return <Loading />;
  if (error) return <Error message={error.message} />;
  return <UserView user={user} />;
}
```

### 4. Avoid useEffect for Data Fetching (Server Components)

For new projects, prefer Server Components over client-side useEffect fetching:

```tsx
// Next.js App Router - Server Component
export default async function UserProfile({ userId }) {
  const res = await fetch(`https://api.example.com/users/${userId}`, {
    next: { revalidate: 60 }, // optional caching
  });
  const user = await res.json();
  return (
    <div>
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}
```

Benefits: no race conditions, better SEO, faster initial load, zero client bundle for fetching.

---

## Advanced Hook Patterns

### useReducer for Complex State

Use useReducer when state logic is complex or when multiple states are related:

```tsx
interface State {
  count: number;
  step: number;
}

type Action =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'setStep'; payload: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'increment':
      return { ...state, count: state.count + state.step };
    case 'decrement':
      return { ...state, count: state.count - state.step };
    case 'setStep':
      return { ...state, step: action.payload };
    default:
      return state;
  }
}

function Counter() {
  const [state, dispatch] = useReducer(reducer, { count: 0, step: 1 });

  return (
    <>
      <p>Count: {state.count}</p>
      <button onClick={() => dispatch({ type: 'increment' })}>+</button>
      <button onClick={() => dispatch({ type: 'decrement' })}>-</button>
      <input
        type="number"
        value={state.step}
        onChange={e => dispatch({ type: 'setStep', payload: Number(e.target.value) })}
      />
    </>
  );
}
```

Benefits: centralized logic, easier testing, better TypeScript support.

### Custom Hooks

Extract reusable logic into custom hooks:

```tsx
// Toggle hook
export function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue(v => !v), []);
  return [value, toggle] as const;
}

// LocalStorage sync hook
export function useLocalStorage<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
```

### useMemo for Expensive Computations

Cache expensive calculations:

```tsx
const filteredItems = useMemo(
  () => items.filter(item => item.name.includes(filter)),
  [items, filter]
);
```

Rules:
- Use only for truly expensive computations
- Always profile first (React DevTools Profiler)
- Don't memoize everything prematurely

### useCallback for Stable References

Prevent unnecessary re-renders of child components:

```tsx
const handleClick = useCallback(() => {
  setCount(prev => prev + 1);
}, []);
```

---

## State Management Strategies

### When to Use Each Approach

| Scenario | Recommended Pattern |
|----------|---------------------|
| Simple UI state (toggles, inputs) | useState |
| Complex interrelated state | useReducer |
| Server data fetching | React Query / Server Components |
| Global app state | Zustand / Jotai / Redux Toolkit |
| Avoiding prop drilling | Context + useReducer |
| Expensive derived values | useMemo |

### Context for Global State

Combine Context with useReducer for global state without external libraries:

```tsx
// State context
const StateContext = createContext<State | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

// Provider
export function Provider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

// Custom hooks for consumption
export function useState() {
  const context = useContext(StateContext);
  if (!context) throw new Error('useState must be used within Provider');
  return context;
}

export function useDispatch() {
  const context = useContext(DispatchContext);
  if (!context) throw new Error('useDispatch must be used within Provider');
  return context;
}
```

### Modern State Libraries

**React Query (TanStack Query)** - Best for server state:
```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['users', userId],
  queryFn: () => fetchUser(userId),
  staleTime: 1000 * 60 * 5, // 5 minutes
});
```

**Zustand** - Simple global state:
```tsx
import { create } from 'zustand';

interface Store {
  count: number;
  increment: () => void;
}

const useStore = create<Store>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

---

## Performance Optimization

### React.memo for Component Memoization

Prevent unnecessary re-renders of child components:

```tsx
const ExpensiveChild = memo(function ExpensiveChild({ data }) {
  // expensive rendering
});
```

### useTransition for Non-Blocking Updates

Keep UI responsive during expensive renders:

```tsx
function SearchResults({ query }) {
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState([]);

  function handleChange(e) {
    const value = e.target.value;

    startTransition(() => {
      setResults(expensiveSearch(value));
    });
  }

  return (
    <>
      <input onChange={handleChange} />
      {isPending ? <Spinner /> : <ResultsList data={results} />}
    </>
  );
}
```

### Code Splitting with lazy and Suspense

```tsx
const HeavyComponent = lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <HeavyComponent />
    </Suspense>
  );
}
```

---

## Testing Hooks

### Testing Custom Hooks with React Testing Library

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { useToggle } from './useToggle';

test('should toggle state', () => {
  const { result } = renderHook(() => useToggle(false));

  expect(result.current[0]).toBe(false);

  act(() => result.current[1]());
  expect(result.current[0]).toBe(true);
});
```

### Testing Components with Hooks

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import Counter from './Counter';

test('should increment count', () => {
  render(<Counter />);

  const button = screen.getByRole('button', { name: /increment/i });
  fireEvent.click(button);

  expect(screen.getByText('Count: 1')).toBeInTheDocument();
});
```

---

## Quick Reference

### Rules of Hooks

1. Only call hooks at the top level (not in loops, conditions, or nested functions)
2. Only call hooks from React function components or custom hooks
3. Hook names must start with `use`

### State Update Flow

```
User Action → Setter Called → React Schedules Render → Component Re-renders → New State Value
```

### Dependency Array Patterns

| Array | Behavior |
|-------|----------|
| `[]` | Run once on mount |
| `[dep1, dep2]` | Run when deps change |
| Omitted | Run on every render |

---

## Resources

- [React Hooks Documentation](https://react.dev/reference/react)
- [React 19 Server Components](https://react.dev/reference/rsc/server-components)
- [TanStack Query](https://tanstack.com/query)
- [Zustand](https://github.com/pmndrs/zustand)
