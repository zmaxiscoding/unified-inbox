import { Injectable } from "@nestjs/common";
import { ChannelType, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksQueueService } from "../webhooks/webhooks.queue.service";

@Injectable()
export class DevService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: WebhooksQueueService,
  ) {}

  async simulateInbound(
    organizationId: string,
    text: string,
    customerDisplay?: string,
  ) {
    const providerMessageId = `sim:${randomUUID()}`;
    const from = customerDisplay?.trim() || "905551234567";
    const phoneNumberId = "sim-dev-phone";

    const payload = this.buildWhatsAppPayload(
      phoneNumberId,
      providerMessageId,
      from,
      text,
    );

    const rawWebhookEvent = await this.prisma.rawWebhookEvent.create({
      data: {
        provider: ChannelType.WHATSAPP,
        providerMessageId,
        externalAccountId: phoneNumberId,
        organizationId,
        payload: payload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await this.queue.enqueue(rawWebhookEvent.id);

    return { ok: true, rawWebhookEventId: rawWebhookEvent.id };
  }

  private buildWhatsAppPayload(
    phoneNumberId: string,
    messageId: string,
    from: string,
    text: string,
  ) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneNumberId },
                messages: [
                  {
                    id: messageId,
                    from,
                    type: "text",
                    text: { body: text },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }
}
