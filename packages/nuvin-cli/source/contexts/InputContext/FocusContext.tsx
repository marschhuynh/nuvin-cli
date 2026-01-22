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

interface FocusableEntry {
  id: string;
  tabIndex: number;
  registrationOrder: number;
}

const DEFAULT_TAB_INDEX = 0;

interface FocusContextInternal {
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  clearFocus: () => void;
  focusableEntriesRef: React.MutableRefObject<Map<string, FocusableEntry>>;
  registrationCounterRef: React.MutableRefObject<number>;
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

export function FocusProvider({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const [focusedId, setFocusedIdState] = useState<string | null>(null);
  const focusableEntriesRef = useRef<Map<string, FocusableEntry>>(new Map());
  const registrationCounterRef = useRef(0);

  const setFocusedId = useCallback((id: string | null) => {
    setFocusedIdState(id);
  }, []);

  const cycleFocus = useCallback((direction: 'forward' | 'backward' = 'forward') => {
    const entries = Array.from(focusableEntriesRef.current.values());
    if (entries.length === 0) {
      return;
    }

    entries.sort((a, b) => {
      if (a.tabIndex !== b.tabIndex) {
        return a.tabIndex - b.tabIndex;
      }
      return a.registrationOrder - b.registrationOrder;
    });
    const ids = entries.map((e) => e.id);

    setFocusedIdState((currentFocusedId) => {
      const currentIndex = currentFocusedId ? ids.indexOf(currentFocusedId) : -1;
      let nextIndex: number;

      if (direction === 'forward') {
        nextIndex = (currentIndex + 1) % ids.length;
      } else {
        nextIndex = currentIndex <= 0 ? ids.length - 1 : currentIndex - 1;
      }

      return ids[nextIndex] || null;
    });
  }, []);

  useEffect(() => {
    if (!active) return;
    
    const handleFocusCycle = (direction: 'forward' | 'backward') => {
      cycleFocus(direction);
    };

    eventBus.on('ui:focus:cycle', handleFocusCycle);

    return () => {
      eventBus.off('ui:focus:cycle', handleFocusCycle);
    };
  }, [cycleFocus, active]);

  const clearFocus = useCallback(() => {
    setFocusedIdState(null);
  }, []);

  const value = useMemo(
    () => ({ focusedId, setFocusedId, clearFocus, focusableEntriesRef, registrationCounterRef, cycleFocus }),
    [focusedId, setFocusedId, clearFocus, cycleFocus],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(
  { active = true, autoFocus = false, id: customId, tabIndex = DEFAULT_TAB_INDEX }: { active?: boolean; autoFocus?: boolean; id?: string; tabIndex?: number } = {},
): FocusContextValue {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocus must be used within a FocusProvider');
  }

  const generatedId = useId();
  const id = customId ?? generatedId;
  const { focusedId, setFocusedId, clearFocus: contextClearFocus, focusableEntriesRef, registrationCounterRef } = context;

  const isFocused = focusedId === id;

  const focus = useCallback(() => {
    setFocusedId(id);
  }, [id, setFocusedId]);

  const clearFocus = useCallback(() => {
    contextClearFocus();
  }, [contextClearFocus]);

  const register = useCallback(() => {
    const order = registrationCounterRef.current++;
    focusableEntriesRef.current.set(id, { id, tabIndex, registrationOrder: order });
    return () => {
      focusableEntriesRef.current.delete(id);
    };
  }, [id, focusableEntriesRef, registrationCounterRef, tabIndex]);

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

  const { cycleFocus, focusableEntriesRef, focusedId, setFocusedId } = context;

  const cycleNext = useCallback(() => {
    cycleFocus('forward');
  }, [cycleFocus]);

  const cycleBack = useCallback(() => {
    cycleFocus('backward');
  }, [cycleFocus]);

  const getFocusableIds = useCallback(() => {
    return Array.from(focusableEntriesRef.current.values())
      .sort((a, b) => {
        if (a.tabIndex !== b.tabIndex) {
          return a.tabIndex - b.tabIndex;
        }
        return a.registrationOrder - b.registrationOrder;
      })
      .map((e) => e.id);
  }, [focusableEntriesRef]);

  return useMemo(() => ({ cycleFocus, cycleNext, cycleBack, focusedId, setFocusedId, getFocusableIds }), [cycleFocus, cycleNext, cycleBack, focusedId, setFocusedId, getFocusableIds]);
}
