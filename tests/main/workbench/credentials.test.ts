import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { it, expect, vi } from 'vitest';
import { DeskCredentials } from '../../../src/main/workbench/credentials';
const crypto = () => ({
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(s),
  decryptString: (b: Buffer) => b.toString(),
});
it('can restart with existing credentials and report status repeatedly without touching the keychain', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'wd-keys-')), 'secrets');
  await new DeskCredentials(file, crypto).setKey('profile', 'fixture');
  const backend = vi.fn(crypto);
  const credentials = new DeskCredentials(file, backend);
  for (let i = 0; i < 3; i++) expect(credentials.status()).toEqual({ keysUnchecked: true, keyIds: [] });
  expect(backend).not.toHaveBeenCalled();
  expect(credentials.key('profile')).toBe('fixture');
  expect(credentials.status()).toEqual({ keysUnchecked: false, keyIds: ['profile'] });
});
it('preserves all existing credentials on denial and retries on explicit use', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'wd-keys-')), 'secrets');
  await new DeskCredentials(file, crypto).setKey('p1', 'fixture');
  const before = readFileSync(file);
  let denied = true;
  const credentials = new DeskCredentials(file, () => ({ ...crypto(), decryptString: b => {
    if (denied) throw new Error('denied');
    return b.toString();
  } }));
  expect(() => credentials.hasKey('p1')).toThrow('unavailable');
  await expect(credentials.setKey('p2', 'another')).rejects.toThrow('unavailable');
  expect(readFileSync(file)).toEqual(before);
  denied = false;
  expect(credentials.key('p1')).toBe('fixture');
});
