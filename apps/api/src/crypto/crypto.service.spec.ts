import { CryptoService } from "./crypto.service";

describe("CryptoService", () => {
  describe("when CHANNEL_TOKEN_SECRET is set", () => {
    let service: CryptoService;

    beforeEach(() => {
      process.env.CHANNEL_TOKEN_SECRET = "test-secret-key-that-is-long-enough";
      service = new CryptoService();
      service.onModuleInit();
    });

    afterEach(() => {
      delete process.env.CHANNEL_TOKEN_SECRET;
    });

    it("should report encryption as enabled", () => {
      expect(service.isEnabled).toBe(true);
    });

    it("should encrypt and decrypt a token correctly", () => {
      const plaintext = "EAABsbCS1iZAg...very-long-token";

      const encrypted = service.encrypt(plaintext);
      expect(encrypted).toMatch(/^enc:/);
      expect(encrypted).not.toContain(plaintext);

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should produce different ciphertext for the same input (non-deterministic)", () => {
      const plaintext = "same-token-value";

      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(service.decrypt(encrypted1)).toBe(plaintext);
      expect(service.decrypt(encrypted2)).toBe(plaintext);
    });

    it("should handle legacy plaintext tokens gracefully on decrypt", () => {
      const legacyPlaintext = "some-old-unencrypted-token";
      expect(service.decrypt(legacyPlaintext)).toBe(legacyPlaintext);
    });

    it("should throw on invalid encrypted format", () => {
      expect(() => service.decrypt("enc:invalid")).toThrow();
    });
  });

  describe("when CHANNEL_TOKEN_SECRET is not set (non-production)", () => {
    let service: CryptoService;

    beforeEach(() => {
      delete process.env.CHANNEL_TOKEN_SECRET;
      process.env.NODE_ENV = "test";
      service = new CryptoService();
      service.onModuleInit();
    });

    afterEach(() => {
      delete process.env.NODE_ENV;
    });

    it("should report encryption as disabled", () => {
      expect(service.isEnabled).toBe(false);
    });

    it("should pass through plaintext on encrypt when disabled", () => {
      const token = "some-token";
      expect(service.encrypt(token)).toBe(token);
    });

    it("should pass through plaintext on decrypt when disabled", () => {
      const token = "some-token";
      expect(service.decrypt(token)).toBe(token);
    });
  });

  describe("when CHANNEL_TOKEN_SECRET is not set in production", () => {
    it("should throw on init in production mode", () => {
      delete process.env.CHANNEL_TOKEN_SECRET;
      process.env.NODE_ENV = "production";
      const service = new CryptoService();
      expect(() => service.onModuleInit()).toThrow(
        "CHANNEL_TOKEN_SECRET is required in production",
      );
      delete process.env.NODE_ENV;
    });
  });

  describe("when CHANNEL_TOKEN_SECRET is too short", () => {
    it("should throw on init if secret is less than 16 chars", () => {
      process.env.CHANNEL_TOKEN_SECRET = "short";
      const service = new CryptoService();
      expect(() => service.onModuleInit()).toThrow(
        "CHANNEL_TOKEN_SECRET must be at least 16 characters",
      );
      delete process.env.CHANNEL_TOKEN_SECRET;
    });
  });
});
