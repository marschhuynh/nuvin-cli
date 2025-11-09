#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = path.join(__dirname, '..', 'source');

function getRelativeDepth(filePath) {
  const relativePath = path.relative(sourceDir, filePath);
  const depth = relativePath.split(path.sep).length - 1;
  return depth;
}

function convertImportPath(importPath, filePath) {
  if (!importPath.startsWith('../')) {
    return importPath;
  }

  const fileDir = path.dirname(filePath);
  const absolutePath = path.resolve(fileDir, importPath);
  const relativeToSource = path.relative(sourceDir, absolutePath);
  
  let newPath = '@/' + relativeToSource.replace(/\\/g, '/');
  
  if (importPath.endsWith('.js')) {
    newPath = newPath.replace(/\.js$/, '.js');
  } else if (importPath.endsWith('.jsx')) {
    newPath = newPath.replace(/\.jsx$/, '.jsx');
  }
  
  return newPath;
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  const newContent = content.replace(
    /from\s+(['"])(\.\.[^'"]+)['"]/g,
    (match, quote, importPath) => {
      const newPath = convertImportPath(importPath, filePath);
      if (newPath !== importPath) {
        modified = true;
        return `from ${quote}${newPath}${quote}`;
      }
      return match;
    }
  );
  
  const newContent2 = newContent.replace(
    /import\s+(['"])(\.\.[^'"]+)['"]/g,
    (match, quote, importPath) => {
      const newPath = convertImportPath(importPath, filePath);
      if (newPath !== importPath) {
        modified = true;
        return `import ${quote}${newPath}${quote}`;
      }
      return match;
    }
  );
  
  if (modified) {
    fs.writeFileSync(filePath, newContent2, 'utf8');
    console.log(`✓ Updated: ${path.relative(process.cwd(), filePath)}`);
    return true;
  }
  
  return false;
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  let count = 0;
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      count += walkDir(filePath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      if (processFile(filePath)) {
        count++;
      }
    }
  }
  
  return count;
}

console.log('Converting relative imports to @/ alias...\n');
const count = walkDir(sourceDir);
console.log(`\n✓ Updated ${count} files`);
