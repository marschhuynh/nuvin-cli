import { readFile } from 'node:fs/promises';

const mdExtRegex = /\.md$/;

export async function load(url, context, nextLoad) {
  if (mdExtRegex.test(url)) {
    const content = await readFile(new URL(url), 'utf-8');
    return {
      format: 'module',
      source: `export default ${JSON.stringify(content)};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
