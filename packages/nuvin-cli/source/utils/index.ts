export const getRandomColor = () => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};

// Export all formatting utilities
export * from './formatters.js';
export { get } from './get.js';
export { calculateStaticCount } from './staticCount.js';
export { getGitContextInfo, type GitContextInfo } from './git-context.js';
