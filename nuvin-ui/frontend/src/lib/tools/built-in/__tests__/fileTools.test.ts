import { readFileTool } from '../readFileTool';
import { newFileTool } from '../newFileTool';
import { editFileTool } from '../editFileTool';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('file tools', () => {
  it('should create, read and edit files', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'tool-test-'));
    const filePath = path.join(dir, 'test.txt');

    // create new file
    const createRes = await newFileTool.execute({
      path: filePath,
      content: 'line1\nline2\nline3\n',
    });
    expect(createRes.status).toBe('success');

    // read full file
    const readAll = await readFileTool.execute({ path: filePath });
    expect(readAll.status).toBe('success');
    expect(readAll.result).toBe('line1\nline2\nline3\n');

    // read lines 2-3
    const readPartial = await readFileTool.execute({
      path: filePath,
      start: 2,
      end: 3,
    });
    expect(readPartial.status).toBe('success');
    expect(readPartial.result).toBe('line2\nline3');

    // edit file
    const diff = ['@@ -1,3 +1,3 @@', ' line1', '-line2', '+lineTwo', ' line3', ''].join('\n');
    const editRes = await editFileTool.execute({ path: filePath, patch: diff });
    expect(editRes.status).toBe('success');

    const after = await readFileTool.execute({ path: filePath });
    expect(after.result).toBe('line1\nlineTwo\nline3\n');
  });
});
