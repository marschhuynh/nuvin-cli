import { useNotificationContext } from '@/contexts/NotificationContext.js';

export interface NotificationHook {
  notification: string | null;
  setNotification: (content: string | null, duration?: number) => void;
}

export const useNotification = (): NotificationHook => {
  const { notification, setNotification } = useNotificationContext();
  return { notification, setNotification };
};
