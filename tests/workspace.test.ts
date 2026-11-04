import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

const allowedInternalDeps: Record<string, string[]> = {
  '@sa/shared': [],
  '@sa/engine': ['@sa/shared'],
  '@sa/parsers': ['@sa/shared'],
  '@sa/db': ['@sa/shared'],
  '@sa/llm': ['@sa/shared'],
};

function readManifest(dir: string): { name: string; dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

describe('workspace dependency direction (ADR-001)', () => {
  const packageDirs = readdirSync(join(root, 'packages')).map((d) => join(root, 'packages', d));

  it('has a rule for every package', () => {
    const names = packageDirs.map((d) => readManifest(d).name).sort();
    expect(names).toEqual(Object.keys(allowedInternalDeps).sort());
  });

  it.each(packageDirs)('%s depends only on allowed workspace packages', (dir) => {
    const manifest = readManifest(dir);
    const internal = Object.keys(manifest.dependencies ?? {}).filter((d) => d.startsWith('@sa/'));
    expect(internal.filter((d) => !allowedInternalDeps[manifest.name]?.includes(d))).toEqual([]);
  });
});
