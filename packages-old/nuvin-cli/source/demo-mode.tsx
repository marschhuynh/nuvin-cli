import { useEffect } from 'react';
import { render } from 'ink';
import { Box, Text, useApp } from 'ink';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Message } from '@nuvin/nuvin-core';
import { ChatDisplay, Footer, InteractionArea } from './components/index.js';
import type { MessageLine, MessageMetadata } from './adapters/index.js';
import { processMessageToUILines } from './utils/messageProcessor.js';
import { ThemeProvider } from './contexts/ThemeContext.js';
import { NotificationProvider } from './contexts/NotificationContext.js';
import { ToolApprovalProvider } from './contexts/ToolApprovalContext.js';
import { CommandProvider } from './modules/commands/provider.js';
import { ConfigProvider } from './contexts/ConfigContext.js';

type DemoProps = {
  messages: MessageLine[];
  metadata: MessageMetadata | null;
  messageCount: number;
};

function DemoDisplayContent({ messages, messageCount }: DemoProps) {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => {
      exit();
    }, 300);

    return () => clearTimeout(timer);
  }, [exit]);

  return (
    <Box flexDirection="column" height="100%" width="100%">
      <ChatDisplay key="demo" messages={messages} />
      <InteractionArea busy={false} vimModeEnabled={false} hasActiveCommand={false} />
      <Footer
        status="Demo Mode"
        toolApprovalMode={false}
        vimModeEnabled={false}
        vimMode="insert"
        workingDirectory={process.cwd()}
      />
      <Box paddingX={1} borderStyle="single" borderColor="yellow" marginTop={-1}>
        <Text color="yellow">🎨 Demo Mode - Loaded {messageCount} messages - Auto-exiting in 3s...</Text>
      </Box>
    </Box>
  );
}

// Mock config for demo
const mockConfig = {
  providers: {},
  session: { memPersist: false },
  requireToolApproval: false,
};

function DemoDisplay({ messages, metadata, messageCount }: DemoProps) {
  return (
    <ThemeProvider>
      <ConfigProvider initialConfig={mockConfig}>
        <NotificationProvider>
          <ToolApprovalProvider
            orchestratorManager={null}
            requireToolApproval={false}
            onError={(msg) => console.error(msg)}
          >
            <CommandProvider>
              <DemoDisplayContent messages={messages} metadata={metadata} messageCount={messageCount} />
            </CommandProvider>
          </ToolApprovalProvider>
        </NotificationProvider>
      </ConfigProvider>
    </ThemeProvider>
  );
}

export class DemoMode {
  private historyPath: string;

  constructor(historyPath: string) {
    this.historyPath = historyPath;
  }

  async run(): Promise<void> {
    try {
      const resolvedPath = path.resolve(this.historyPath);

      const fileContent = await fs.readFile(resolvedPath, 'utf-8');
      const historyData = JSON.parse(fileContent) as { default?: Message[] };

      if (!historyData.default || historyData.default.length === 0) {
        console.error('Error: No messages found in history file');
        process.exit(1);
      }

      const cliMessages = historyData.default;
      const uiMessages: MessageLine[] = [];

      for (const msg of cliMessages) {
        uiMessages.push(...processMessageToUILines(msg));
      }

      let metadata: MessageMetadata | null = null;
      for (let i = cliMessages.length - 1; i >= 0; i--) {
        const msg = cliMessages[i];
        if (msg.role === 'assistant') {
          metadata = {
            totalTokens: 0,
          };
          break;
        }
      }

      console.clear();
      console.log('\x1Bc');

      const { waitUntilExit } = render(
        <DemoDisplay messages={uiMessages} metadata={metadata} messageCount={cliMessages.length} />,
        {
          exitOnCtrlC: true,
          patchConsole: true,
          maxFps: 30,
        },
      );

      await waitUntilExit();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error(`Error: History file not found: ${this.historyPath}`);
      } else if (error instanceof SyntaxError) {
        console.error(`Error: Invalid JSON in history file: ${this.historyPath}`);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error loading demo: ${message}`);
      }
      process.exit(1);
    }
  }
}
