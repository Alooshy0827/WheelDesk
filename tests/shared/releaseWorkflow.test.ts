import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const workflow = readFileSync(resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8');
describe('internal installer workflow', () => {
  it('requires manual dispatch and never publishes a GitHub release', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/\b(push|tags):/);
    expect(workflow).not.toContain('gh release');
    expect(workflow).not.toContain('contents: write');
  });
  it('builds native installers on their respective operating systems', () => {
    expect(workflow).toMatch(/os: windows-latest\s+command: dist:win/);
    expect(workflow).toMatch(/os: macos-latest\s+command: dist:mac/);
    expect(workflow).toContain('npm run test:helper');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('actions/upload-artifact@v4');
  });
});
