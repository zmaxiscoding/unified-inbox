import { ConflictException } from "@nestjs/common";
import { CryptoService } from "../crypto/crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { ChannelsService } from "./channels.service";

describe("ChannelsService", () => {
  let service: ChannelsService;
  let prisma: {
    channelAccount: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
    channel: {
      upsert: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      channelAccount: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      channel: {
        upsert: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === "function") {
          return (arg as (tx: unknown) => unknown)(prisma);
        }

        return arg;
      }),
    };

    const crypto = { encrypt: jest.fn((v: string) => v), decrypt: jest.fn((v: string) => v) };
    service = new ChannelsService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
    );
  });

  it("should list channels without access tokens", async () => {
    prisma.channelAccount.findMany.mockResolvedValue([
      {
        id: "ca_1",
        provider: "WHATSAPP",
        externalAccountId: "12345",
        displayPhoneNumber: "+90 555 111 22 33",
        wabaId: "waba_1",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    ]);

    const result = await service.listChannels("org_1");

    expect(result).toEqual([
      {
        id: "ca_1",
        provider: "WHATSAPP",
        phoneNumberId: "12345",
        displayPhoneNumber: "+90 555 111 22 33",
        wabaId: "waba_1",
        connectedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    ]);
  });

  it("should block duplicate whatsapp connect", async () => {
    prisma.channelAccount.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.connectWhatsAppChannel("org_1", "usr_1", {
        phoneNumberId: "12345",
        accessToken: "token",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("should connect instagram channel and return response without token", async () => {
    prisma.channelAccount.create.mockResolvedValue({
      id: "ca_2",
      provider: "INSTAGRAM",
      externalAccountId: "ig_12345",
      displayPhoneNumber: "My Brand",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    prisma.channel.upsert.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    const result = await service.connectInstagramChannel("org_1", "usr_1", {
      instagramAccountId: "ig_12345",
      accessToken: "token",
      displayName: "My Brand",
    });

    expect(result).toEqual({
      id: "ca_2",
      provider: "INSTAGRAM",
      instagramAccountId: "ig_12345",
      displayName: "My Brand",
      connectedAt: new Date("2026-03-01T00:00:00.000Z"),
    });
  });

  it("should block duplicate instagram connect", async () => {
    prisma.channelAccount.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.connectInstagramChannel("org_1", "usr_1", {
        instagramAccountId: "ig_12345",
        accessToken: "token",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
