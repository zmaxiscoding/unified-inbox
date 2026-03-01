import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { ChannelType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectWhatsAppChannelDto } from "./dto/connect-whatsapp-channel.dto";

type ChannelAccountListItem = {
  id: string;
  provider: ChannelType;
  externalAccountId: string;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  createdAt: Date;
};

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async listChannels(organizationId: string) {
    const accounts = await this.prisma.channelAccount.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        provider: true,
        externalAccountId: true,
        displayPhoneNumber: true,
        wabaId: true,
        createdAt: true,
      },
    });

    return accounts.map((account: ChannelAccountListItem) => ({
      id: account.id,
      provider: account.provider,
      phoneNumberId: account.externalAccountId,
      displayPhoneNumber: account.displayPhoneNumber,
      wabaId: account.wabaId,
      connectedAt: account.createdAt,
    }));
  }

  async connectWhatsAppChannel(
    organizationId: string,
    actorUserId: string,
    dto: ConnectWhatsAppChannelDto,
  ) {
    const phoneNumberId = dto.phoneNumberId.trim();
    const accessToken = dto.accessToken.trim();
    const displayPhoneNumber = dto.displayPhoneNumber?.trim() || null;
    const wabaId = dto.wabaId?.trim() || null;

    if (!phoneNumberId || !accessToken) {
      throw new BadRequestException("phoneNumberId and accessToken are required");
    }

    try {
      const account = await this.prisma.$transaction(async (tx) => {
        const createdAccount = await tx.channelAccount.create({
          data: {
            organizationId,
            provider: ChannelType.WHATSAPP,
            externalAccountId: phoneNumberId,
            // TODO(encrypt): persist encrypted token instead of plaintext.
            accessToken,
            displayPhoneNumber,
            wabaId,
          },
          select: {
            id: true,
            provider: true,
            externalAccountId: true,
            displayPhoneNumber: true,
            wabaId: true,
            createdAt: true,
          },
        });

        await tx.channel.upsert({
          where: {
            organizationId_type_externalId: {
              organizationId,
              type: ChannelType.WHATSAPP,
              externalId: phoneNumberId,
            },
          },
          create: {
            type: ChannelType.WHATSAPP,
            name: displayPhoneNumber
              ? `WhatsApp ${displayPhoneNumber}`
              : "WhatsApp Business",
            externalId: phoneNumberId,
            organizationId,
          },
          update: {
            name: displayPhoneNumber
              ? `WhatsApp ${displayPhoneNumber}`
              : "WhatsApp Business",
          },
        });

        await tx.auditLog.create({
          data: {
            action: "channel.connected",
            organizationId,
            actorId: actorUserId,
            metadata: {
              provider: ChannelType.WHATSAPP,
              externalAccountId: phoneNumberId,
            },
          },
        });

        return createdAccount;
      });

      return {
        id: account.id,
        provider: account.provider,
        phoneNumberId: account.externalAccountId,
        displayPhoneNumber: account.displayPhoneNumber,
        wabaId: account.wabaId,
        connectedAt: account.createdAt,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("WhatsApp channel already connected");
      }

      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown) {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return false;
    }

    return (error as { code?: string }).code === "P2002";
  }
}
