import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useId,
  useRef,
  type ReactNode,
  useEffect,
} from 'react';
import { eventBus } from '../../services/EventBus.js';

interface FocusContextInternal {
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  clearFocus: () => void;
  focusableIdsRef: React.MutableRefObject<Set<string>>;
  cycleFocus: (direction?: 'forward' | 'backward') => void;
}

interface FocusContextValue {
  id: string;
  isFocused: boolean;
  focus: () => void;
  clearFocus: () => void;
}

interface FocusCycleValue {
  cycleFocus: (direction?: 'forward' | 'backward') => void;
  cycleNext: () => void;
  cycleBack: () => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  getFocusableIds: () => string[];
}

const FocusContext = createContext<FocusContextInternal | undefined>(undefined);

export function FocusProvider({ children }: { children: ReactNode }) {
  const [focusedId, setFocusedIdState] = useState<string | null>(null);
  const focusableIdsRef = useRef<Set<string>>(new Set());

  const setFocusedId = useCallback((id: string | null) => {
    setFocusedIdState(id);
  }, []);

  const cycleFocus = useCallback((direction: 'forward' | 'backward' = 'forward') => {
    const ids = Array.from(focusableIdsRef.current);
    if (ids.length === 0) {
      return;
    }

    setFocusedIdState((currentFocusedId) => {
      const currentIndex = currentFocusedId ? ids.indexOf(currentFocusedId) : -1;
      let nextIndex: number;

      if (direction === 'forward') {
        nextIndex = (currentIndex + 1) % ids.length;
      } else {
        nextIndex = currentIndex <= 0 ? ids.length - 1 : currentIndex - 1;
      }

      const nextId = ids[nextIndex] || null;
      return nextId;
    });
  }, []);

  useEffect(() => {
    const handleFocusCycle = (direction: 'forward' | 'backward') => {
      cycleFocus(direction);
    };

    eventBus.on('ui:focus:cycle', handleFocusCycle);

    return () => {
      eventBus.off('ui:focus:cycle', handleFocusCycle);
    };
  }, [cycleFocus]);

  const clearFocus = useCallback(() => {
    setFocusedIdState(null);
  }, []);

  const value = useMemo(
    () => ({ focusedId, setFocusedId, clearFocus, focusableIdsRef, cycleFocus }),
    [focusedId, setFocusedId, clearFocus, cycleFocus],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(
  { active, autoFocus, id: customId }: { active?: boolean; autoFocus?: boolean; id?: string } = { active: true, autoFocus: false },
): FocusContextValue {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocus must be used within a FocusProvider');
  }

  const generatedId = useId();
  const id = customId ?? generatedId;
  const { focusedId, setFocusedId, clearFocus: contextClearFocus, focusableIdsRef } = context;

  const isFocused = focusedId === id;

  const focus = useCallback(() => {
    setFocusedId(id);
  }, [id, setFocusedId]);

  const clearFocus = useCallback(() => {
    contextClearFocus();
  }, [contextClearFocus]);

  const register = useCallback(() => {
    if (focusableIdsRef.current.has(id)) {
      console.warn(`[FocusContext] Duplicate focus id detected: "${id}". This may cause unexpected focus behavior.`);
    }
    focusableIdsRef.current.add(id);
    return () => {
      focusableIdsRef.current.delete(id);
    };
  }, [id, focusableIdsRef]);

  useEffect(() => {
    if (!active) return;
    return register();
  }, [register, active]);

  const hasAutoFocusedRef = useRef(false);

  useEffect(() => {
    if (!active || !autoFocus || hasAutoFocusedRef.current) return;
    focus();
    hasAutoFocusedRef.current = true;
  }, [active, autoFocus, focus]);

  return useMemo(() => ({ id, isFocused, focus, clearFocus }), [id, isFocused, focus, clearFocus]);
}

export function useFocusCycle(): FocusCycleValue {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocusCycle must be used within FocusProvider');
  }

  const { cycleFocus, focusableIdsRef, focusedId, setFocusedId } = context;

  const cycleNext = useCallback(() => {
    cycleFocus('forward');
  }, [cycleFocus]);

  const cycleBack = useCallback(() => {
    cycleFocus('backward');
  }, [cycleFocus]);

  const getFocusableIds = useCallback(() => {
    return Array.from(focusableIdsRef.current);
  }, [focusableIdsRef]);

  return useMemo(() => ({ cycleFocus, cycleNext, cycleBack, focusedId, setFocusedId, getFocusableIds }), [cycleFocus, cycleNext, cycleBack, focusedId, setFocusedId, getFocusableIds]);
}
