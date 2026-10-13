import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'fixtures' ? [] : sourceFiles(full);
    }
    const isSource = entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts');
    return isSource ? [full] : [];
  });
}

/** Returns the import specifiers (`from '...'`, including `import type`) in a file. */
function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

function importsFromModule(moduleDir: string, forbidden: string[]): string[] {
  const offenders: string[] = [];
  for (const file of sourceFiles(path.join(SRC, moduleDir))) {
    for (const spec of importsOf(file)) {
      if (!spec.startsWith('.')) continue;
      const target = path.relative(SRC, path.resolve(path.dirname(file), spec));
      if (forbidden.some((m) => target === m || target.startsWith(`${m}${path.sep}`))) {
        offenders.push(`${path.relative(SRC, file)} -> ${spec}`);
      }
    }
  }
  return offenders;
}

describe('provider and module boundaries', () => {
  it('only src/llm/provider.ts imports the Bedrock adapter', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => importsOf(file).includes('@ai-sdk/amazon-bedrock'))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([path.join('llm', 'provider.ts')]);
  });

  it('src/vault/ does not import from agent/, llm/ or cli/', () => {
    expect(importsFromModule('vault', ['agent', 'llm', 'cli'])).toEqual([]);
  });

  it('src/llm/ does not import from vault/, agent/ or cli/', () => {
    expect(importsFromModule('llm', ['vault', 'agent', 'cli'])).toEqual([]);
  });
});
