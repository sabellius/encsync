import {
  Cipher,
  decryptedSize as rcloneDecryptedSize,
  encryptedSize as rcloneEncryptedSize,
} from "@fyears/rclone-crypt";

const SALT = "encsync-v1";

export class CryptoLayer {
  private readonly cipher: Cipher;
  private keyed = false;

  constructor(private readonly password: string) {
    this.cipher = new Cipher("base32");
  }

  private async ensureKeyed(): Promise<void> {
    if (this.keyed) return;
    await this.cipher.key(this.password, SALT);
    this.keyed = true;
  }

  async encryptName(vaultPath: string): Promise<string> {
    await this.ensureKeyed();
    return this.cipher.encryptFileName(vaultPath);
  }

  async decryptName(encPath: string): Promise<string> {
    await this.ensureKeyed();
    return this.cipher.decryptFileName(encPath);
  }

  async encryptData(plaintext: Uint8Array): Promise<Uint8Array> {
    await this.ensureKeyed();
    return this.cipher.encryptData(plaintext, undefined);
  }

  async decryptData(ciphertext: Uint8Array): Promise<Uint8Array> {
    await this.ensureKeyed();
    return this.cipher.decryptData(ciphertext);
  }

  encryptedSize(plaintextSize: number): number {
    return rcloneEncryptedSize(plaintextSize);
  }

  decryptedSize(ciphertextSize: number): number {
    return rcloneDecryptedSize(ciphertextSize);
  }
}
