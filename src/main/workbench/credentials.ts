import { existsSync } from 'node:fs';
import { SecretStore, SecretsUnavailableError, type Crypto } from '../teammate/secrets';

/** Opening the desktop and displaying metadata must never initialize the OS keychain. */
export class DeskCredentials {
  private opened?: SecretStore;

  constructor(private readonly file: string, private readonly crypto: () => Crypto) {}

  status(): { keyIds: string[]; keysUnchecked: boolean } {
    return { keyIds: this.opened?.storedKeyIds() ?? [], keysUnchecked: !this.opened && existsSync(this.file) };
  }

  private open(): SecretStore {
    try {
      return this.opened ??= new SecretStore(this.file, this.crypto(), Date.now, true);
    } catch (error) {
      if (error instanceof SecretsUnavailableError) throw new Error('unavailable');
      throw error;
    }
  }

  key(id: string): string | null {
    if (!this.opened && !existsSync(this.file)) return null;
    return this.open().key(id);
  }

  hasKey(id: string): boolean {
    if (!this.opened && !existsSync(this.file)) return false;
    return this.open().storedKeyIds().includes(id);
  }

  async setKey(id: string, value: string): Promise<void> {
    if (!value && !this.opened && !existsSync(this.file)) return;
    try { await this.open().setKey(id, value); }
    catch (error) {
      if (error instanceof SecretsUnavailableError) throw new Error('unavailable');
      throw error;
    }
  }
}
