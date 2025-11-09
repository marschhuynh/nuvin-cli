import React, { useEffect, useState } from 'react';
import { Box, Static } from 'ink';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { scanAvailableSessions } from '@/hooks/useSessionManagement.js';
import { WelcomeMessage } from './index.js';

type SessionInfo = {
  sessionId: string;
  timestamp: string;
  lastMessage: string;
  messageCount: number;
};

export const HeaderContent: React.FC<{ sessions: SessionInfo[]; columns: number }> = ({ sessions, columns }) => {
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width={columns}
      paddingY={2}
      marginBottom={1}
    >
      <WelcomeMessage recentSessions={sessions} />
    </Box>
  );
};

const HeaderComponent: React.FC = () => {
  const [columns] = useStdoutDimensions();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const result = await scanAvailableSessions();
        setSessions(result.slice(0, 5));
      } catch (_error) {
      } finally {
        setLoaded(true);
      }
    };

    loadSessions();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Static items={[{ sessions, columns }]}>
        {(item) => <HeaderContent sessions={item.sessions} columns={item.columns} />}
      </Static>
    </Box>
  );
};

export const Header = React.memo(HeaderComponent);
