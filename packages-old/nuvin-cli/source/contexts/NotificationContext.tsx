import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';

export interface NotificationContextValue {
  notification: string | null;
  setNotification: (content: string | null, duration?: number) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notification, setNotificationState] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setNotification = useCallback((content: string | null, duration = 3000) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setNotificationState(content);

    if (content && duration > 0) {
      if (duration === 0) {
        setNotificationState(null);
      } else {
        timeoutRef.current = setTimeout(() => {
          setNotificationState(null);
          timeoutRef.current = null;
        }, duration);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const value: NotificationContextValue = useMemo(
    () => ({
      notification,
      setNotification,
    }),
    [notification, setNotification],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotificationContext = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
};
