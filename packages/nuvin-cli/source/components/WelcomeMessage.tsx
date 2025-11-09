import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import Gradient from 'ink-gradient';
import { getVersion } from '@/utils/version.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

type SessionInfo = {
  sessionId: string;
  timestamp: string;
  lastMessage: string;
  messageCount: number;
};

type WelcomeMessageProps = {
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
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const truncateMessage = (message: string, maxLength: number = 35): string => {
  if (!message) return 'No preview';
  const cleaned = message.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.substring(0, maxLength - 3)}...`;
};

const LOGO = `Welcome to
███╗   ██╗ ██╗   ██╗ ██╗   ██╗ ██╗ ███╗   ██╗
██╔██╗ ██║ ██║   ██║ ██║   ██║ ██║ ██╔██╗ ██║
██║╚██╗██║ ██║   ██║ ╚██╗ ██╔╝ ██║ ██║╚██╗██║
██║ ╚████║ ╚██████╔╝  ╚████╔╝  ██║ ██║ ╚████║
╚═╝  ╚═══╝  ╚═════╝    ╚═══╝   ╚═╝ ╚═╝  ╚═══╝`;

const WelcomeMessage = ({ recentSessions }: WelcomeMessageProps) => {
  const { theme } = useTheme();
  const [cols, _rows] = useStdoutDimensions();

  return (
    <Box flexDirection="column" width="100%" marginTop={0} marginBottom={0} paddingX={0} gap={0}>
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

      <Box justifyContent="center" gap={1} marginTop={1}>
        {/* Left column - Quick Commands */}
        <Box borderStyle="round" borderColor={theme.welcome.hint} paddingX={2} paddingY={1} width={40}>
          <Box flexDirection="column">
            <Text color={theme.welcome.title} bold>
              Quick Commands
            </Text>
            <Text> </Text>
            <Text color={theme.welcome.subtitle}>
              {`/help`.padEnd(9)} <Text dimColor>All commands</Text>
            </Text>
            <Text color={theme.welcome.subtitle}>
              {`/mcp`.padEnd(9)} <Text dimColor>MCP servers</Text>
            </Text>
            <Text color={theme.welcome.subtitle}>
              {`/model`.padEnd(9)} <Text dimColor>Change AI model</Text>
            </Text>
            <Text color={theme.welcome.subtitle}>
              {`/history`.padEnd(9)} <Text dimColor>View conversation</Text>
            </Text>
            <Text color={theme.welcome.subtitle}>
              {`/docs`.padEnd(9)} <Text dimColor>Documentation</Text>
            </Text>
          </Box>
        </Box>

        {/* Right column - Recent Activity */}
        <Box borderStyle="round" borderColor={theme.welcome.hint} paddingX={2} paddingY={1} flexGrow={1}>
          <Box flexDirection="column">
            <Text color={theme.welcome.title} bold>
              Recent Activity
            </Text>
            <Text> </Text>
            {recentSessions.length === 0 ? (
              <Text color={theme.welcome.subtitle} dimColor>
                No recent activity
              </Text>
            ) : (
              recentSessions.map((session) => (
                <Box key={session.sessionId} flexDirection="column" marginBottom={0}>
                  <Text color={theme.welcome.subtitle}>
                    <Text dimColor>{formatRelativeTime(session.timestamp)}</Text>
                    {' - '}
                    <Text dimColor>{truncateMessage(session.lastMessage, cols - 60)}</Text>
                  </Text>
                </Box>
              ))
            )}
            <Text> </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export { WelcomeMessage };
