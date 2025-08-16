import { Tool } from '@/types/tools';

export const timeTool: Tool = {
  definition: {
    name: 'get_current_time',
    description:
      'Get current date and time information in various formats and timezones',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description:
            'Timezone identifier (e.g., "UTC", "America/New_York", "Europe/London")',
        },
        format: {
          type: 'string',
          description:
            'Output format: "iso", "readable", "timestamp", "custom"',
          enum: ['iso', 'readable', 'timestamp', 'custom'],
        },
        customFormat: {
          type: 'string',
          description:
            'Custom date format string (only used when format is "custom")',
        },
      },
    },
  },

  async execute(parameters) {
    try {
      const {
        timezone = 'UTC',
        format = 'readable',
        customFormat,
      } = parameters;

      const now = new Date();

      // Get time in specified timezone
      let timeString: string;
      let timeData: any = {
        timestamp: now.getTime(),
        iso: now.toISOString(),
      };

      if (timezone && timezone !== 'UTC') {
        try {
          const options: Intl.DateTimeFormatOptions = {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
          };

          timeData.timezone = timezone;
          timeData.localized = new Intl.DateTimeFormat('en-US', options).format(
            now,
          );
        } catch (error) {
          return {
            status: 'error',
            type: 'text',
            result: `Invalid timezone: ${timezone}`,
          };
        }
      }

      switch (format) {
        case 'iso':
          timeString = timeData.iso;
          break;
        case 'timestamp':
          timeString = timeData.timestamp.toString();
          break;
        case 'custom':
          if (!customFormat) {
            return {
              status: 'error',
              type: 'text',
              result:
                'customFormat parameter is required when format is "custom"',
            };
          }
          // Basic custom formatting (simplified)
          timeString = customFormat
            .replace('YYYY', now.getFullYear().toString())
            .replace('MM', (now.getMonth() + 1).toString().padStart(2, '0'))
            .replace('DD', now.getDate().toString().padStart(2, '0'))
            .replace('HH', now.getHours().toString().padStart(2, '0'))
            .replace('mm', now.getMinutes().toString().padStart(2, '0'))
            .replace('ss', now.getSeconds().toString().padStart(2, '0'));
          break;
        default:
          timeString = timeData.localized || now.toLocaleString();
      }

      return {
        status: 'success',
        type: 'text',
        result: timeString,
        additionalResult: {
          timezone: timezone,
          format: format,
          details: timeData,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        type: 'text',
        result: `Time retrieval error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  },

  validate(parameters) {
    if (
      parameters.format &&
      !['iso', 'readable', 'timestamp', 'custom'].includes(parameters.format)
    ) {
      return false;
    }
    if (parameters.format === 'custom' && !parameters.customFormat) {
      return false;
    }
    return true;
  },

  category: 'utility',
  version: '1.0.0',
  author: 'system',
};
