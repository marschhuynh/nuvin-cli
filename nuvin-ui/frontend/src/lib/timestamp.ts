/**
 * Utility functions for formatting timestamps
 */

/**
 * Formats a timestamp into a relative time string (e.g., "2 minutes ago", "Just now")
 */
export function formatRelativeTime(timestamp: string | Date): string {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInMs = now.getTime() - time.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInSeconds < 30) {
    return 'Just now';
  } else if (diffInSeconds < 60) {
    return `${diffInSeconds}s ago`;
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  } else if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  } else {
    // For older timestamps, show the actual date
    return time.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: time.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}

/**
 * Formats a timestamp for display in messages (more detailed)
 */
export function formatMessageTime(timestamp: string | Date): string {
  const time = new Date(timestamp);
  const now = new Date();
  const isToday = time.toDateString() === now.toDateString();

  if (isToday) {
    return time.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } else {
    return time.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
}

/**
 * Creates a standardized timestamp string
 */
export function createTimestamp(): string {
  return new Date().toISOString();
}
