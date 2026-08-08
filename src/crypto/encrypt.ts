import {
  Cipher,
  decryptedSize as rcloneDecryptedSize,
  encryptedSize as rcloneEncryptedSize,
} from "@fyears/rclone-crypt";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const SALT = "encsync-v1";

export class CryptoLayer {
  private constructor(private readonly cipher: Cipher) {}

  static async create(password: string): Promise<CryptoLayer> {
    const cipher = new Cipher("base32");
    await cipher.key(password, SALT);
    return new CryptoLayer(cipher);
  }

  encryptPath(vaultPath: string): Promise<string> {
    return this.cipher.encryptFileName(vaultPath);
  }

  decryptPath(encPath: string): Promise<string> {
    return this.cipher.decryptFileName(encPath);
  }

  encryptData(plaintext: Uint8Array): Promise<Uint8Array> {
    return this.cipher.encryptData(plaintext, undefined);
  }

  decryptData(ciphertext: Uint8Array): Promise<Uint8Array> {
    return this.cipher.decryptData(ciphertext);
  }

  hash(plaintext: Uint8Array): string {
    return bytesToHex(sha256(plaintext));
  }

  encryptedSize(plaintextSize: number): number {
    return rcloneEncryptedSize(plaintextSize);
  }

  decryptedSize(ciphertextSize: number): number {
    return rcloneDecryptedSize(ciphertextSize);
  }
}
