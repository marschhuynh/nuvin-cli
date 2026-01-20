import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import Gradient from 'ink-gradient';
import type { SessionInfo } from '@/types.js';
import { getVersion } from '@/utils/version';
import { formatRelativeTime, getMessageCountBadge } from '@/utils/formatters.js';
import { useStdoutDimensionsContext } from '@/contexts/StdoutDimensionsContext';

type RecentSessionsProps = {
  recentSessions: SessionInfo[];
};

const version = getVersion();
const minVersionWidth = 7;
const versionLen = Math.max(minVersionWidth, version.length);
const line1 = `│  ●  ●  ● ${'─'.repeat(versionLen - 2)}  │`;
const line2 = `│  NUVIN${' '.repeat(versionLen + 2)} │`;
const line3 = `│  >_     ${version.padEnd(versionLen, ' ')} │`;
const lineWidth = line1.length;
const barWidth = lineWidth - 2;
const segments = Math.floor(barWidth / 3);
const remainder = barWidth % 3;
const topBar = '──┴'.repeat(segments) + '─'.repeat(remainder);
const bottomBar = '──┬'.repeat(segments) + '─'.repeat(remainder);
const ICON_2 = `╭${topBar}╮
${line1}
${line2}
${line3}
╰${bottomBar}╯`;

const WelcomeLogo = ({ recentSessions }: { recentSessions: SessionInfo[] }) => {
  const { cols } = useStdoutDimensionsContext();
  return (
    <Box flexDirection="row" width="100%" marginTop={1} marginBottom={4} flexWrap="nowrap">
      <Box justifyContent="center" flexDirection="column" alignItems="center" marginRight={2} minWidth={20}>
        <Gradient colors={['#FF5F6D', '#FFC371']}>
          <Text>{`${ICON_2}`}</Text>
        </Gradient>
      </Box>
      {cols >= 60 && <RecentSessions recentSessions={recentSessions} />}
    </Box>
  );
};

// Recent sessions list component
const RecentSessions = ({ recentSessions }: RecentSessionsProps) => {
  const { theme } = useTheme();
  const { cols } = useStdoutDimensionsContext();

  return (
    <Box flexDirection="column" overflow="hidden" width={cols - 24}>
      <Text color={theme.welcome.title} bold underline>
        Recent Sessions
      </Text>
      {recentSessions.length === 0 ? (
        <Text color={theme.welcome.subtitle} dimColor>
          No recent sessions
        </Text>
      ) : (
        recentSessions.map((session) => {
          const relativeTime = formatRelativeTime(session.timestamp);
          const displayText = (session.topic || session.lastMessage).split('\n').join(' ');
          const badge = getMessageCountBadge(session.messageCount);

          return (
            <Box key={session.sessionId} flexDirection="row" flexWrap="nowrap" overflow="hidden" flexShrink={1}>
              <Box flexShrink={1} overflow="hidden">
                <Text color={theme.welcome.subtitle} dimColor wrap="truncate">
                  {`${relativeTime} - ${displayText}`}
                </Text>
              </Box>
              <Box flexWrap="nowrap" flexShrink={0} marginLeft={1}>
                <Text color={badge.color} dimColor>
                  {badge.text}
                </Text>
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
};

export { RecentSessions, WelcomeLogo };
