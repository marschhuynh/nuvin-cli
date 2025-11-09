import type { CommandRegistry } from '@/modules/commands/types.js';
import { AuthCommandComponent } from './Handler.js';

export function registerAuthCommand(registry: CommandRegistry) {
  registry.register({
    id: '/auth',
    type: 'component',
    description: 'Authenticate with a provider.',
    category: 'integration',
    component: AuthCommandComponent,
    onExit({ eventBus }) {
      eventBus.emit('ui:auth:close', undefined);
    },
  });
}
