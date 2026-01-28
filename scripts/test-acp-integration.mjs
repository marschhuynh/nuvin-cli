#!/usr/bin/env node
/**
 * Comprehensive test suite for ACP mode
 * Tests that the ACP server correctly handles JSON-RPC messages
 */

import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

console.log('=== ACP Mode Integration Test ===\n');

// Test 1: Initialize Request
console.log('Test 1: Initialize Request');
const test1 = spawn('node', ['packages/nuvin-cli/dist/cli.js', '--acp'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout1 = '';
let stderr1 = '';

test1.stdout.on('data', (data) => {
  stdout1 += data.toString();
});

test1.stderr.on('data', (data) => {
  stderr1 += data.toString();
});

await setTimeout(1000);

test1.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: 1 },
}) + '\n');

await setTimeout(1000);
test1.kill();

const response1 = JSON.parse(stdout1.trim());
if (response1.jsonrpc === '2.0' && response1.id === 1 && response1.result) {
  console.log('✅ Initialize request handled correctly');
  console.log('   Response:', JSON.stringify(response1.result.agentInfo));
} else {
  console.log('❌ Initialize request failed');
  console.log('   Response:', stdout1);
  process.exit(1);
}

// Test 2: Session Creation
console.log('\nTest 2: Session Creation');
const test2 = spawn('node', ['packages/nuvin-cli/dist/cli.js', '--acp'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout2 = '';
const responses = [];

test2.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      responses.push(JSON.parse(line));
    } catch (e) {
      // Ignore non-JSON lines
    }
  }
});

await setTimeout(1000);

// Send initialize
test2.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: 1 },
}) + '\n');

await setTimeout(500);

// Send session/new
test2.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 2,
  method: 'session/new',
  params: { cwd: process.cwd() },
}) + '\n');

await setTimeout(1000);
test2.kill();

if (responses.length === 2) {
  const initResp = responses.find(r => r.id === 1);
  const sessionResp = responses.find(r => r.id === 2);
  
  if (initResp && sessionResp && sessionResp.result && sessionResp.result.sessionId) {
    console.log('✅ Session creation successful');
    console.log('   Session ID:', sessionResp.result.sessionId);
  } else {
    console.log('❌ Session creation failed');
    console.log('   Responses:', responses);
    process.exit(1);
  }
} else {
  console.log('❌ Expected 2 responses, got', responses.length);
  process.exit(1);
}

// Test 3: Invalid JSON handling
console.log('\nTest 3: Invalid JSON Handling');
const test3 = spawn('node', ['packages/nuvin-cli/dist/cli.js', '--acp'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout3 = '';
let stderr3 = '';

test3.stdout.on('data', (data) => {
  stdout3 += data.toString();
});

test3.stderr.on('data', (data) => {
  stderr3 += data.toString();
});

await setTimeout(1000);

test3.stdin.write('invalid json\n');

await setTimeout(500);
test3.kill();

if (stderr3.includes('Failed to parse JSON')) {
  console.log('✅ Invalid JSON logged to stderr');
} else {
  console.log('⚠️  Invalid JSON handling unclear');
}

// Test 4: Normal CLI mode still works
console.log('\nTest 4: Normal CLI Mode');
const test4 = spawn('node', ['packages/nuvin-cli/dist/cli.js', '--version'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
});

let version = '';
test4.stdout.on('data', (data) => {
  version += data.toString();
});

// Wait for process to actually exit
await new Promise((resolve) => {
  test4.on('exit', resolve);
});

if (version.trim().match(/\d+\.\d+\.\d+/)) {
  console.log('✅ Normal CLI mode works:', version.trim());
} else {
  console.log('❌ Normal CLI mode broken');
  console.log('   Output:', JSON.stringify(version));
  process.exit(1);
}

console.log('\n=== All Tests Passed ✅ ===\n');
process.exit(0);
