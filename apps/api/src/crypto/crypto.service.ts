import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = "unified-inbox-channel-token-v1";

@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly logger = new Logger(CryptoService.name);
  private derivedKey: Buffer | null = null;

  onModuleInit() {
    const secret = process.env.CHANNEL_TOKEN_SECRET?.trim();
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "CHANNEL_TOKEN_SECRET is required in production. " +
            "Set it to a secret string of at least 16 characters.",
        );
      }
      this.logger.warn(
        "CHANNEL_TOKEN_SECRET is not set. Token encryption is disabled. " +
          "Set CHANNEL_TOKEN_SECRET in .env to enable encrypted token storage.",
      );
      return;
    }

    if (secret.length < 16) {
      throw new Error(
        "CHANNEL_TOKEN_SECRET must be at least 16 characters for adequate security",
      );
    }

    this.derivedKey = scryptSync(secret, SALT, KEY_LENGTH);
  }

  get isEnabled(): boolean {
    return this.derivedKey !== null;
  }

  encrypt(plaintext: string): string {
    if (!this.derivedKey) {
      return plaintext;
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.derivedKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Format: base64(iv + authTag + ciphertext)
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return `enc:${combined.toString("base64")}`;
  }

  decrypt(ciphertext: string): string {
    if (!this.derivedKey) {
      return ciphertext;
    }

    // Plain text tokens (pre-encryption) don't have the enc: prefix
    if (!ciphertext.startsWith("enc:")) {
      return ciphertext;
    }

    const combined = Buffer.from(ciphertext.slice(4), "base64");
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error("Invalid encrypted token format");
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.derivedKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }
}
