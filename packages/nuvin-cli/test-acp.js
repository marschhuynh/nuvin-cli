#!/usr/bin/env node
/**
 * Manual test script for ACP server
 * Run: node test-acp.js
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Spawn the ACP server
const server = spawn('node', ['dist/cli.js', '--acp'], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Capture stderr for debugging
server.stderr.on('data', (data) => {
  console.error('[STDERR]:', data.toString());
});

// Parse JSON-RPC responses
let buffer = '';
function waitForResponse() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
    
    const handler = (data) => {
      buffer += data.toString();
      
      const match = buffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (match) {
        const length = parseInt(match[1], 10);
        const headerEnd = buffer.indexOf('\r\n\r\n') + 4;
        const body = buffer.slice(headerEnd);
        if (body.length >= length) {
          server.stdout.off('data', handler);
          clearTimeout(timeout);
          const json = body.slice(0, length);
          buffer = body.slice(length);
          resolve(JSON.parse(json));
        }
      }
    };
    server.stdout.on('data', handler);
  });
}

function sendRequest(id, method, params) {
  const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;
  console.log(`\n[SENDING ${method}]:`, JSON.stringify(params, null, 2));
  server.stdin.write(header + message);
}

async function main() {
  try {
    // 1. Initialize
    sendRequest(1, 'initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: 'zed', title: 'Zed', version: '0.222.2' }
    });
    
    const initResponse = await waitForResponse();
    console.log('[RESPONSE initialize]:', JSON.stringify(initResponse, null, 2));
    
    // 2. Create session
    sendRequest(2, 'session/new', {
      cwd: process.cwd(),
      mcpServers: []
    });
    
    const sessionResponse = await waitForResponse();
    console.log('[RESPONSE session/new]:', JSON.stringify(sessionResponse, null, 2));
    
    const sessionId = sessionResponse.result?.sessionId;
    if (sessionId) {
      console.log('\n✅ Session created successfully:', sessionId);
    }
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    server.kill();
    process.exit(0);
  }
}

main();
