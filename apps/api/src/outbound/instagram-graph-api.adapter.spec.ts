import { CryptoService } from "../crypto/crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { InstagramGraphApiAdapter } from "./instagram-graph-api.adapter";

describe("InstagramGraphApiAdapter", () => {
  const originalFetch = global.fetch;

  let service: InstagramGraphApiAdapter;
  let prisma: {
    channelAccount: {
      findFirst: jest.Mock;
    };
  };
  let crypto: { decrypt: jest.Mock };

  beforeEach(() => {
    prisma = {
      channelAccount: {
        findFirst: jest.fn(),
      },
    };
    crypto = {
      decrypt: jest.fn((v: string) => v),
    };

    service = new InstagramGraphApiAdapter(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("should send text via Instagram Send API and return provider message id", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue({ accessToken: "ig-test-token" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          message_id: "mid.ig_abc123",
        }),
      ),
    }) as unknown as typeof fetch;

    const result = await service.sendTextMessage({
      organizationId: "org_1",
      instagramAccountId: "ig_12345",
      recipientId: "user_67890",
      text: "Merhaba Instagram",
    });

    expect(result).toEqual({ providerMessageId: "mid.ig_abc123" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://graph.instagram.com/v21.0/me/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer ig-test-token",
          "Content-Type": "application/json",
        }),
      }),
    );

    const callBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body,
    );
    expect(callBody).toEqual({
      recipient: { id: "user_67890" },
      message: { text: "Merhaba Instagram" },
    });
  });

  it("should not leak access token in provider error message", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue({ accessToken: "very-secret-ig-token" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          error: {
            message: "Invalid parameter",
          },
        }),
      ),
    }) as unknown as typeof fetch;

    let thrown: Error | null = null;
    try {
      await service.sendTextMessage({
        organizationId: "org_1",
        instagramAccountId: "ig_12345",
        recipientId: "user_67890",
        text: "Merhaba",
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.message).toContain("Instagram API error (400): Invalid parameter");
    expect(thrown?.message).not.toContain("very-secret-ig-token");
  });

  it("should throw when channel account mapping is missing", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.sendTextMessage({
        organizationId: "org_1",
        instagramAccountId: "ig_12345",
        recipientId: "user_67890",
        text: "Merhaba",
      }),
    ).rejects.toThrow("Instagram channel account not found for conversation");
  });

  it("should throw when response has no message_id", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue({ accessToken: "ig-token" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(JSON.stringify({})),
    }) as unknown as typeof fetch;

    await expect(
      service.sendTextMessage({
        organizationId: "org_1",
        instagramAccountId: "ig_12345",
        recipientId: "user_67890",
        text: "Merhaba",
      }),
    ).rejects.toThrow("Instagram send response is missing message_id");
  });
});
