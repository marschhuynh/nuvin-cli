import { ProfileManager } from './profile-manager.js';
import { DEFAULT_PROFILE } from './profile-types.js';
import type { CreateProfileOptions, DeleteProfileOptions } from './profile-types.js';

export class ProfileCliHandler {
  private profileManager: ProfileManager;

  constructor() {
    this.profileManager = new ProfileManager(console.log);
  }

  async handleProfileCommand(args: string[]): Promise<void> {
    await this.profileManager.initialize();
    
    const [command, ...rest] = args;

    switch (command) {
      case 'list':
        await this.listProfiles();
        break;
      case 'create':
        await this.createProfile(rest[0], rest.slice(1));
        break;
      case 'delete':
        await this.deleteProfile(rest[0], rest.slice(1));
        break;
      case 'switch':
        await this.switchProfile(rest[0]);
        break;
      case 'show':
        await this.showProfile();
        break;
      case 'clone':
        await this.cloneProfile(rest[0], rest[1]);
        break;
      case 'help':
      case '--help':
      case '-h':
        this.showHelp();
        break;
      default:
        if (!command) {
          this.showHelp();
        } else {
          console.error(`Unknown profile command: ${command}`);
          this.showHelp();
          process.exit(1);
        }
    }
  }

  private async listProfiles(): Promise<void> {
    try {
      const profiles = await this.profileManager.list();
      const activeProfile = await this.profileManager.getActive();
      
      console.log('\nAvailable Profiles:');
      console.log('===================');
      
      profiles.sort((a, b) => {
        if (a.name === DEFAULT_PROFILE) return -1;
        if (b.name === DEFAULT_PROFILE) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const profile of profiles) {
        const isActive = profile.name === activeProfile;
        const status = isActive ? ' [ACTIVE]' : '';
        
        console.log(`\n${profile.name}${status}`);
        if (profile.description) {
          console.log(`  Description: ${profile.description}`);
        }
        console.log(`  Created: ${new Date(profile.created).toLocaleString()}`);
        console.log(`  Last used: ${new Date(profile.lastUsed).toLocaleString()}`);
        
        if (this.profileManager.isDefault(profile.name)) {
          console.log(`  Path: ${this.profileManager.getProfileDir(profile.name)}`);
        } else {
          console.log(`  Path: ${this.profileManager.getProfileDir(profile.name)}`);
        }
      }
      
      console.log();
    } catch (error) {
      console.error('Failed to list profiles:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async createProfile(name: string, options: string[]): Promise<void> {
    if (!name) {
      console.error('Error: Profile name is required');
      console.log('Usage: nuvin-cli profile create <name> [--description "Description"] [--clone-from <source>]');
      process.exit(1);
    }

    try {
      const createOptions: CreateProfileOptions = {};
      
      // Parse options
      for (let i = 0; i < options.length; i += 2) {
        const flag = options[i];
        const value = options[i + 1];
        
        if (!value) continue;
        
        switch (flag) {
          case '--description':
          case '-d':
            createOptions.description = value;
            break;
          case '--clone-from':
          case '-c':
            createOptions.cloneFrom = value;
            break;
        }
      }

      await this.profileManager.create(name, createOptions);
      console.log(`✅ Profile '${name}' created successfully`);
      
      if (createOptions.cloneFrom) {
        console.log(`   (cloned from '${createOptions.cloneFrom}')`);
      }
      
      console.log(`   Path: ${this.profileManager.getProfileDir(name)}`);
    } catch (error) {
      console.error('Failed to create profile:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async deleteProfile(name: string, options: string[]): Promise<void> {
    if (!name) {
      console.error('Error: Profile name is required');
      console.log('Usage: nuvin-cli profile delete <name> [--force]');
      process.exit(1);
    }

    try {
      const deleteOptions: DeleteProfileOptions = {
        force: options.includes('--force') || options.includes('-f'),
      };

      await this.profileManager.delete(name, deleteOptions);
      console.log(`✅ Profile '${name}' deleted successfully`);
    } catch (error) {
      console.error('Failed to delete profile:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async switchProfile(name: string): Promise<void> {
    if (!name) {
      console.error('Error: Profile name is required');
      console.log('Usage: nuvin-cli profile switch <name>');
      console.log('Available profiles:');
      await this.listProfiles();
      process.exit(1);
    }

    try {
      await this.profileManager.switch(name);
      console.log(`✅ Switched to profile '${name}'`);
      console.log(`   Path: ${this.profileManager.getProfileDir(name)}`);
    } catch (error) {
      console.error('Failed to switch profile:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async showProfile(): Promise<void> {
    try {
      const activeProfile = await this.profileManager.getActive();
      const profileMetadata = await this.profileManager.list()
        .then(profiles => profiles.find(p => p.name === activeProfile));
      
      console.log('\nCurrent Profile:');
      console.log('================');
      console.log(`Name: ${activeProfile}`);
      
      if (profileMetadata) {
        if (profileMetadata.description) {
          console.log(`Description: ${profileMetadata.description}`);
        }
        console.log(`Created: ${new Date(profileMetadata.created).toLocaleString()}`);
        console.log(`Last used: ${new Date(profileMetadata.lastUsed).toLocaleString()}`);
      }
      
      console.log(`Path: ${this.profileManager.getProfileDir(activeProfile)}`);
      console.log(`Config: ${this.profileManager.getProfileConfigPath(activeProfile)}`);
      console.log(`MCP Config: ${this.profileManager.getProfileMcpConfigPath(activeProfile)}`);
      console.log(`Agents: ${this.profileManager.getProfileAgentsDir(activeProfile)}`);
      console.log(`Sessions: ${this.profileManager.getProfileSessionsDir(activeProfile)}`);
      console.log();
    } catch (error) {
      console.error('Failed to show profile:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async cloneProfile(source: string, target: string): Promise<void> {
    if (!source || !target) {
      console.error('Error: Both source and target profile names are required');
      console.log('Usage: nuvin-cli profile clone <source> <target>');
      console.log('Available profiles:');
      await this.listProfiles();
      process.exit(1);
    }

    try {
      const createOptions: CreateProfileOptions = {
        cloneFrom: source,
        description: `Clone of '${source}'`,
      };

      await this.profileManager.create(target, createOptions);
      console.log(`✅ Profile '${target}' created successfully`);
      console.log(`   (cloned from '${source}')`);
      console.log(`   Path: ${this.profileManager.getProfileDir(target)}`);
    } catch (error) {
      console.error('Failed to clone profile:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private showHelp(): void {
    console.log(`
Profile Management Commands

Usage:
  nuvin-cli profile <command> [options]

Commands:
  list                        List all profiles
  create <name>               Create a new profile
  delete <name>               Delete a profile
  switch <name>               Switch active profile
  show                        Show current profile info
  clone <source> <target>     Clone an existing profile
  help                        Show this help message

Create Options:
  --description, -d <text>     Profile description
  --clone-from, -c <source>    Clone existing profile

Delete Options:
  --force, -f                  Force delete even if active

Examples:
  nuvin-cli profile list
  nuvin-cli profile create work --description "Work projects"
  nuvin-cli profile switch work
  nuvin-cli profile clone work client-project
  nuvin-cli profile delete old-project --force
  nuvin-cli profile show

Note: The 'default' profile is reserved and cannot be deleted.
The default profile uses the root ~/.nuvin-cli directory.
`);
  }
}