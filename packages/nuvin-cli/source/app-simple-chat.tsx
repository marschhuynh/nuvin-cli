import { render, Box, Text, useStdout } from 'ink';
import { useState, useEffect } from 'react';
import { CommandProvider } from './modules/commands/provider';
import { ConfigBridge } from './components/ConfigBridge';
import { AltModeProvider } from './contexts/AltModeContext';
import { ConfigProvider } from './contexts/ConfigContext';
import { InputProvider, defaultMiddleware } from './contexts/InputContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { StdoutDimensionsProvider } from './contexts/StdoutDimensionsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import TextInput from './components/TextInput/index.js';
import { VirtualizedList } from './components/VirtualizedList.js';

type Message = {
  id: string;
  type: 'user' | 'assistant';
  content: string;
};

type ListItem = { type: 'message'; message: Message };

function ChatApp() {
  const { stdout } = useStdout();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', type: 'assistant', content: 'Welcome! Type a message.' },
  ]);
  const [input, setInput] = useState('');

  const rows = stdout.rows;
  const inputHeight = 3;
  const listHeight = rows - inputHeight;

  useEffect(() => {
    stdout.write('\x1b[?1049h');
    return () => {
      stdout.write('\x1b[?1049l');
    };
  }, [stdout]);

  const handleSubmit = () => {
    if (!input.trim()) return;

    setMessages((prev) => [...prev, { id: Date.now().toString(), type: 'user', content: input }]);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: `You said: "${input}"`,
        },
      ]);
    }, 300);

    setInput('');
  };

  const listItems: ListItem[] = messages.map((msg) => ({
    type: 'message' as const,
    message: msg,
  }));

  const renderItem = (item: ListItem) => (
    <Box marginBottom={1}>
      <Text color={item.message.type === 'user' ? 'cyan' : 'green'}>
        {item.message.type === 'user' ? '❯ ' : '● '}
      </Text>
      <Text>{item.message.content}</Text>
    </Box>
  );

  const keyExtractor = (item: ListItem) => item.message.id;

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <VirtualizedList items={listItems} renderItem={renderItem} keyExtractor={keyExtractor} height={listHeight} />
      </Box>
      <Box flexDirection="row" marginX={1}>
        <Text color="cyan">❯ </Text>
        <Box flexGrow={1}>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Type a message..."
            focus={true}
          />
        </Box>
      </Box>
    </Box>
  );
}

render(
  <ThemeProvider>
    <AltModeProvider>
      <StdoutDimensionsProvider>
        <InputProvider middleware={defaultMiddleware}>
          <ConfigProvider initialConfig={{}}>
            <NotificationProvider>
              <CommandProvider>
                <ConfigBridge>
                  <ChatApp />
                </ConfigBridge>
              </CommandProvider>
            </NotificationProvider>
          </ConfigProvider>
        </InputProvider>
      </StdoutDimensionsProvider>
    </AltModeProvider>
  </ThemeProvider>,
  { exitOnCtrlC: true },
);
