/**
 * useFocus / useFocusCycle — Hooks for focus management.
 *
 * Replaces v1 FocusContext hooks with Zustand store subscriptions.
 */
import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { useStore } from "zustand";
import { focusStore } from "./focus.js";

export type FocusContextValue = {
  id: string;
  isFocused: boolean;
  focus: () => void;
  clearFocus: () => void;
};

export type FocusCycleValue = {
  cycleFocus: (direction?: "forward" | "backward") => void;
  cycleNext: () => void;
  cycleBack: () => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  getFocusableIds: () => string[];
};

const DEFAULT_TAB_INDEX = 0;

export function useFocus({
  active = true,
  autoFocus = false,
  id: customId,
  tabIndex = DEFAULT_TAB_INDEX,
}: {
  active?: boolean;
  autoFocus?: boolean;
  id?: string;
  tabIndex?: number | string;
} = {}): FocusContextValue {
  const generatedId = useId();
  const id = customId ?? generatedId;
  const numericTabIndex = typeof tabIndex === "string" ? Number.parseInt(tabIndex, 10) : tabIndex;

  const focusedId = useStore(focusStore, (s) => s.focusedId);
  const isFocused = focusedId === id;

  const focus = useCallback(() => {
    focusStore.getState().setFocusedId(id);
  }, [id]);

  const clearFocus = useCallback(() => {
    focusStore.getState().clearFocus();
  }, []);

  useEffect(() => {
    if (!active) return;
    return focusStore.getState().registerFocusable(id, numericTabIndex);
  }, [id, active, numericTabIndex]);

  const hasAutoFocusedRef = useRef(false);

  useEffect(() => {
    if (!active || !autoFocus || hasAutoFocusedRef.current) return;
    focus();
    hasAutoFocusedRef.current = true;
  }, [active, autoFocus, focus]);

  return useMemo(() => ({ id, isFocused, focus, clearFocus }), [id, isFocused, focus, clearFocus]);
}

export function useFocusCycle(): FocusCycleValue {
  const focusedId = useStore(focusStore, (s) => s.focusedId);

  const cycleFocus = useCallback((direction?: "forward" | "backward") => {
    focusStore.getState().cycleFocus(direction);
  }, []);

  const cycleNext = useCallback(() => {
    focusStore.getState().cycleFocus("forward");
  }, []);

  const cycleBack = useCallback(() => {
    focusStore.getState().cycleFocus("backward");
  }, []);

  const setFocusedId = useCallback((id: string | null) => {
    focusStore.getState().setFocusedId(id);
  }, []);

  const getFocusableIds = useCallback(() => {
    return focusStore.getState().getFocusableIds();
  }, []);

  return useMemo(
    () => ({ cycleFocus, cycleNext, cycleBack, focusedId, setFocusedId, getFocusableIds }),
    [cycleFocus, cycleNext, cycleBack, focusedId, setFocusedId, getFocusableIds],
  );
}
