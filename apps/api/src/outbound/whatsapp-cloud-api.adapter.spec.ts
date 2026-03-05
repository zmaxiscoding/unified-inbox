import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppCloudApiAdapter } from "./whatsapp-cloud-api.adapter";

describe("WhatsAppCloudApiAdapter", () => {
  const originalFetch = global.fetch;

  let service: WhatsAppCloudApiAdapter;
  let prisma: {
    channelAccount: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      channelAccount: {
        findFirst: jest.fn(),
      },
    };

    service = new WhatsAppCloudApiAdapter(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("should send text via WhatsApp Cloud API and return provider message id", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue({ accessToken: "test-token" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          messaging_product: "whatsapp",
          messages: [{ id: "wamid.abc123" }],
        }),
      ),
    }) as unknown as typeof fetch;

    const result = await service.sendTextMessage({
      organizationId: "org_1",
      phoneNumberId: "12345",
      to: "905551112233",
      text: "Merhaba",
    });

    expect(result).toEqual({ providerMessageId: "wamid.abc123" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/12345/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("should not leak access token in provider error message", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue({ accessToken: "very-secret-token" });
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
        phoneNumberId: "12345",
        to: "905551112233",
        text: "Merhaba",
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.message).toContain("WhatsApp API error (400): Invalid parameter");
    expect(thrown?.message).not.toContain("very-secret-token");
  });

  it("should throw when channel account mapping is missing", async () => {
    prisma.channelAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.sendTextMessage({
        organizationId: "org_1",
        phoneNumberId: "12345",
        to: "905551112233",
        text: "Merhaba",
      }),
    ).rejects.toThrow("WhatsApp channel account not found for conversation");
  });
});
