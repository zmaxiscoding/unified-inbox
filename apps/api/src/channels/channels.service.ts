import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { ChannelType } from "@prisma/client";
import { CryptoService } from "../crypto/crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectInstagramChannelDto } from "./dto/connect-instagram-channel.dto";
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

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
            accessToken: this.crypto.encrypt(accessToken),
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

  async connectInstagramChannel(
    organizationId: string,
    actorUserId: string,
    dto: ConnectInstagramChannelDto,
  ) {
    const instagramAccountId = dto.instagramAccountId.trim();
    const accessToken = dto.accessToken.trim();
    const displayName = dto.displayName?.trim() || null;

    if (!instagramAccountId || !accessToken) {
      throw new BadRequestException("instagramAccountId and accessToken are required");
    }

    try {
      const account = await this.prisma.$transaction(async (tx) => {
        const createdAccount = await tx.channelAccount.create({
          data: {
            organizationId,
            provider: ChannelType.INSTAGRAM,
            externalAccountId: instagramAccountId,
            accessToken: this.crypto.encrypt(accessToken),
            displayPhoneNumber: displayName,
          },
          select: {
            id: true,
            provider: true,
            externalAccountId: true,
            displayPhoneNumber: true,
            createdAt: true,
          },
        });

        await tx.channel.upsert({
          where: {
            organizationId_type_externalId: {
              organizationId,
              type: ChannelType.INSTAGRAM,
              externalId: instagramAccountId,
            },
          },
          create: {
            type: ChannelType.INSTAGRAM,
            name: displayName
              ? `Instagram ${displayName}`
              : "Instagram Business",
            externalId: instagramAccountId,
            organizationId,
          },
          update: {
            name: displayName
              ? `Instagram ${displayName}`
              : "Instagram Business",
          },
        });

        await tx.auditLog.create({
          data: {
            action: "channel.connected",
            organizationId,
            actorId: actorUserId,
            metadata: {
              provider: ChannelType.INSTAGRAM,
              externalAccountId: instagramAccountId,
            },
          },
        });

        return createdAccount;
      });

      return {
        id: account.id,
        provider: account.provider,
        instagramAccountId: account.externalAccountId,
        displayName: account.displayPhoneNumber,
        connectedAt: account.createdAt,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("Instagram channel already connected");
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
