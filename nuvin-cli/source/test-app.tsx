import React, { useEffect, useState } from 'react';
import { render, Box, Text } from 'ink';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

export default function App() {
    const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
    const [out, setOut] = useState<string>('');

    useEffect(() => {
        let disposed = false;

        (async () => {
            setStatus('running');

            const client = new Client({ name: 'ink-tui', version: '1.0.0', options: { logLevel: 'error' } }, { capabilities: { tools: {}, resources: { subscribe: true }, prompts: {}, logging: {} } });
            const transport = new StdioClientTransport({
                // Launch your server as a subprocess; example shows wcgw via `uv`
                command: 'uv',
                args: ['tool', 'run', '--python', '3.12', 'wcgw@latest'],
                stderr: 'ignore'
            });
            await client.connect(transport);

            await client.request(
                {
                    method: "tools/call",
                    params: {
                        name: "Initialize",
                        arguments: {
                            type: "first_call",
                            any_workspace_path: "",        // or absolute project path
                            initial_files_to_read: [],     // can be empty
                            task_id_to_resume: "",         // empty if none
                            mode_name: "wcgw",
                            thread_id: "ink-session-1"     // << SAME ID you will use later
                        }
                    }
                },
                CallToolResultSchema   // optional validation
            );

            const requestPromise = client.request(
                {
                    method: "tools/call",
                    params: {
                        name: "BashCommand",
                        arguments: {
                            thread_id: "ink-session-1",     // keep this stable for the session
                            action_json: {
                                type: "command",
                                command: "ls -la && echo DONE"
                            },
                            // optional: wait some seconds for output before returning
                            wait_for_seconds: 5
                        }
                    }
                },
                CallToolResultSchema
            );

            try {
                const res = await requestPromise;

                if (disposed) return;

                const text =
                    (res.content ?? [])
                        .map((c: any) => c.text)
                        .filter(Boolean)
                        .join('\n') || '(no output)';
                setOut(text);
                setStatus('done');
            } catch (err: any) {
                if (!disposed) {
                    setOut(String(err?.message ?? err));
                    setStatus('error');
                }
            }
        })();

        return () => { disposed = true; };
    }, []);

    return (
        <Box width={80} height={20} borderStyle="round" paddingX={1} flexDirection="column">
            <Text><Text color="cyan">tools/call BashCommand</Text> <Text dimColor>({status})</Text></Text>
            <Text>{out}</Text>
        </Box>
    );
}

render(<App />); // consider { patchConsole: false } if other libs log
