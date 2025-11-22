import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import Gradient from 'ink-gradient';
import { getVersion } from '@/utils/version.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import type { SessionInfo } from '@/types.js';

type RecentSessionsProps = {
  recentSessions: SessionInfo[];
};

const formatRelativeTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 5) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) {
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return diffInHours < 6 ? `${diffInHours}h ago` : `Today ${timeStr}`;
  }
  if (diffInDays === 1) {
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `Yesterday ${timeStr}`;
  }
  if (diffInDays < 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${dayName} ${timeStr}`;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const getSessionStatus = (lastMessage: string | undefined, messageCount: number) => {
  if (!lastMessage) return { icon: '○', color: 'gray' };
  if (lastMessage.includes('Successfully') || lastMessage.includes('successfully')) {
    return { icon: '✓', color: 'green' };
  }
  if (lastMessage.includes('error') || lastMessage.includes('Error')) {
    return { icon: '✗', color: 'red' };
  }
  if (lastMessage.includes('try again')) {
    return { icon: '⚠', color: 'yellow' };
  }
  if (messageCount === 1) {
    return { icon: '○', color: 'gray' };
  }
  return { icon: '●', color: 'blue' };
};

const getMessageCountBadge = (count: number) => {
  if (count === 1) return { text: '1 msg', color: 'gray' };
  if (count < 10) return { text: `${count} msgs`, color: 'cyan' };
  if (count < 50) return { text: `${count} msgs`, color: 'green' };
  return { text: `${count} msgs`, color: 'magenta' };
};

const LOGO = `Welcome to
███╗   ██╗ ██╗   ██╗ ██╗   ██╗ ██╗ ███╗   ██╗
██╔██╗ ██║ ██║   ██║ ██║   ██║ ██║ ██╔██╗ ██║
██║╚██╗██║ ██║   ██║ ╚██╗ ██╔╝ ██║ ██║╚██╗██║
██║ ╚████║ ╚██████╔╝  ╚████╔╝  ██║ ██║ ╚████║
╚═╝  ╚═══╝  ╚═════╝    ╚═══╝   ╚═╝ ╚═╝  ╚═══╝`;

// Logo component - always displayed
const WelcomeLogo = () => {
  const [cols, _rows] = useStdoutDimensions();

  return (
    <Box flexDirection="column" width={cols} marginTop={0} marginBottom={0} paddingX={0} gap={0}>
      <Box alignItems="center" paddingTop={0} paddingBottom={0} flexDirection="column">
        <Box flexDirection="column" alignItems="center" justifyContent="center">
          <Gradient colors={['#FF5F6D', '#FFC371']}>
            <Text>{`${LOGO}`}</Text>
          </Gradient>
          <Box alignSelf="flex-end">
            <Gradient colors={['#FF5F6D', '#FFC371']}>
              <Text>{`v${getVersion()}`}</Text>
            </Gradient>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

// Recent sessions list component
const RecentSessions = ({ recentSessions }: RecentSessionsProps) => {
  const { theme } = useTheme();
  const [cols, _rows] = useStdoutDimensions();

  return (
    <Box flexDirection="column" width={cols} marginTop={0} marginBottom={0} paddingX={0} gap={0}>
      <Box justifyContent="center" gap={1} marginTop={1}>
        {/* Recent Activity */}
        <Box flexDirection="column" paddingX={2} flexGrow={1}>
          <Box
            borderStyle="single"
            borderLeft={false}
            borderRight={false}
            borderTop={false}
          >
            <Text color={theme.welcome.title} bold>
              Recent Activity
            </Text>
          </Box>
          {recentSessions.length === 0 ? (
            <Text color={theme.welcome.subtitle} dimColor>
              No recent activity
            </Text>
          ) : (
            recentSessions.slice(0, 5).map((session) => {
              const relativeTime = formatRelativeTime(session.timestamp);
              const displayText = session.topic || session.lastMessage;
              const status = getSessionStatus(session.lastMessage, session.messageCount);
              const badge = getMessageCountBadge(session.messageCount);

              return (
                <Box key={session.sessionId} flexDirection="row">
                  <Box>
                    <Text color={status.color}>{`${status.icon} `}</Text>
                    <Text color={theme.welcome.subtitle} dimColor>
                      {relativeTime}
                      {' · '}
                    </Text>
                  </Box>
                  <Box>
                    <Text color={theme.welcome.subtitle} dimColor>
                      {displayText}
                      {' · '}
                    </Text>
                  </Box>
                  <Box>
                    <Text color={badge.color} dimColor>
                      {badge.text}
                    </Text>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      </Box>
    </Box>
  );
};

export { RecentSessions, WelcomeLogo };
