// Test for todo_write Tool Completion Messages

import { todoWriteTool } from './nuvin-ui/frontend/src/lib/tools/built-in/todoWriteTool';

// Mock test scenarios for todo_write tool
const testScenarios = [
  {
    name: 'Mixed Status Todos',
    todos: [
      { id: '1', content: 'Setup project', status: 'completed', priority: 'high' },
      { id: '2', content: 'Write tests', status: 'in_progress', priority: 'medium' },
      { id: '3', content: 'Deploy app', status: 'pending', priority: 'low' }
    ],
    expectedMessage: 'Regular progress message'
  },
  {
    name: 'All Todos Completed',
    todos: [
      { id: '1', content: 'Setup project', status: 'completed', priority: 'high' },
      { id: '2', content: 'Write tests', status: 'completed', priority: 'medium' },
      { id: '3', content: 'Deploy app', status: 'completed', priority: 'low' }
    ],
    expectedMessage: 'Celebration message'
  },
  {
    name: 'Single Completed Todo',
    todos: [
      { id: '1', content: 'Fix bug', status: 'completed', priority: 'high' }
    ],
    expectedMessage: 'Single task celebration'
  },
  {
    name: 'All Pending Todos',
    todos: [
      { id: '1', content: 'Plan project', status: 'pending', priority: 'high' },
      { id: '2', content: 'Research tools', status: 'pending', priority: 'medium' }
    ],
    expectedMessage: 'Regular planning message'
  }
];

async function test_todo_write_messages() {
  console.log('🧪 Testing todo_write Tool Completion Messages\n');

  for (const [index, scenario] of testScenarios.entries()) {
    console.log(`Test ${index + 1}: ${scenario.name}`);
    console.log('Input todos:', JSON.stringify(scenario.todos, null, 2));

    try {
      const result = await todoWriteTool.execute(
        { todos: scenario.todos },
        { sessionId: 'test-session' }
      );

      if (result.status === 'success') {
        console.log('✅ Tool execution successful');
        console.log('📝 Result message preview:');

        // Extract first line of result for preview
        const firstLine = result.result.split('\n')[0];
        console.log(`   "${firstLine}"`);

        // Check if it's a celebration message
        const isCelebration = result.result.includes('🎉') || result.result.includes('Outstanding work');
        console.log(`🎉 Celebration message: ${isCelebration ? 'YES' : 'NO'}`);

        // Show additional result data
        if (result.additionalResult) {
          const { allCompleted, celebrationMessage, progress } = result.additionalResult;
          console.log(`📊 Progress: ${progress}`);
          console.log(`✨ All completed: ${allCompleted}`);
          if (celebrationMessage) {
            console.log(`🎊 Celebration: ${celebrationMessage}`);
          }
        }

      } else {
        console.log('❌ Tool execution failed:', result.result);
      }

    } catch (error) {
      console.log('❌ Test error:', error);
    }

    console.log('─'.repeat(60));
  }
}

// Example message outputs
console.log(`
📋 todo_write Tool Message Examples:

## Regular Progress Message:
"Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if applicable"

## Completion Celebration Message:
"🎉 Outstanding work! All 3 todo items have been completed successfully! This is a significant achievement that deserves recognition."

## System Reminder Differences:

### Regular:
<system-reminder>
Your todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents...
</system-reminder>

### Celebration:
<system-reminder>
All todo items are now completed! You can celebrate this accomplishment with the user and ask if they'd like to work on new tasks...
</system-reminder>

The todo_write tool now provides contextual feedback based on completion status!
`);

// Run the test
test_todo_write_messages();

export { test_todo_write_messages };