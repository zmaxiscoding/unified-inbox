import { PrismaService } from "../prisma/prisma.service";
import { OutboundWorkerService } from "./outbound.worker.service";
import { WhatsAppCloudApiAdapter } from "./whatsapp-cloud-api.adapter";

describe("OutboundWorkerService", () => {
  let service: OutboundWorkerService;
  let prisma: {
    message: {
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let adapter: {
    sendTextMessage: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      message: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    adapter = {
      sendTextMessage: jest.fn(),
    };

    service = new OutboundWorkerService(
      prisma as unknown as PrismaService,
      adapter as unknown as WhatsAppCloudApiAdapter,
    );
  });

  it("should send QUEUED outbound message and mark it as SENT", async () => {
    prisma.message.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.message.findUnique.mockResolvedValue({
      id: "msg_1",
      body: "Merhaba",
      direction: "OUTBOUND",
      conversation: {
        organizationId: "org_1",
        contactPhone: "905551112233",
        channel: {
          type: "WHATSAPP",
          externalId: "12345",
        },
      },
    });
    adapter.sendTextMessage.mockResolvedValue({ providerMessageId: "wamid.abc123" });
    prisma.message.update.mockResolvedValue({});

    await service.processOutboundMessage("msg_1");

    expect(prisma.message.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "msg_1",
        direction: "OUTBOUND",
        deliveryStatus: {
          in: ["QUEUED", "FAILED"],
        },
      },
      data: {
        deliveryStatus: "SENDING",
        deliveryStatusUpdatedAt: expect.any(Date),
        providerError: null,
        failedAt: null,
      },
    });
    expect(adapter.sendTextMessage).toHaveBeenCalledWith({
      organizationId: "org_1",
      phoneNumberId: "12345",
      to: "905551112233",
      text: "Merhaba",
    });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "msg_1" },
      data: {
        providerMessageId: "wamid.abc123",
        deliveryStatus: "SENT",
        deliveryStatusUpdatedAt: expect.any(Date),
        sentAt: expect.any(Date),
        providerError: null,
        failedAt: null,
      },
    });
  });

  it("should no-op idempotently when message is already claimed/processed", async () => {
    prisma.message.updateMany.mockResolvedValue({ count: 0 });

    await service.processOutboundMessage("msg_2");

    expect(prisma.message.findUnique).not.toHaveBeenCalled();
    expect(adapter.sendTextMessage).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it("should mark message as FAILED and rethrow when provider send fails", async () => {
    prisma.message.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.message.findUnique.mockResolvedValue({
      id: "msg_3",
      body: "Merhaba",
      direction: "OUTBOUND",
      conversation: {
        organizationId: "org_1",
        contactPhone: "905551112233",
        channel: {
          type: "WHATSAPP",
          externalId: "12345",
        },
      },
    });
    adapter.sendTextMessage.mockRejectedValue(new Error("provider timeout"));

    await expect(service.processOutboundMessage("msg_3")).rejects.toThrow(
      "provider timeout",
    );

    expect(prisma.message.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "msg_3",
        direction: "OUTBOUND",
      },
      data: {
        deliveryStatus: "FAILED",
        deliveryStatusUpdatedAt: expect.any(Date),
        providerError: "provider timeout",
        failedAt: expect.any(Date),
      },
    });
  });
});
