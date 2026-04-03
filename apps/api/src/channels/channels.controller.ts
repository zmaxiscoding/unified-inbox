import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { Session } from "../auth/session.decorator";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ConnectInstagramChannelDto } from "./dto/connect-instagram-channel.dto";
import { ConnectWhatsAppChannelDto } from "./dto/connect-whatsapp-channel.dto";
import { ChannelsService } from "./channels.service";

@Controller("channels")
@UseGuards(SessionAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  listChannels(@Session() session: SessionPayload) {
    this.assertOwner(session, "Only owners can view channel settings");
    return this.channelsService.listChannels(session.organizationId);
  }

  @Post("whatsapp/connect")
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  connectWhatsAppChannel(
    @Body() body: ConnectWhatsAppChannelDto,
    @Session() session: SessionPayload,
  ) {
    this.assertOwner(session, "Only owners can manage channels");

    return this.channelsService.connectWhatsAppChannel(
      session.organizationId,
      session.userId,
      body,
    );
  }

  @Post("instagram/connect")
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  connectInstagramChannel(
    @Body() body: ConnectInstagramChannelDto,
    @Session() session: SessionPayload,
  ) {
    this.assertOwner(session, "Only owners can manage channels");

    return this.channelsService.connectInstagramChannel(
      session.organizationId,
      session.userId,
      body,
    );
  }

  @Delete(":id")
  @HttpCode(204)
  disconnectChannel(
    @Param("id") id: string,
    @Session() session: SessionPayload,
  ) {
    this.assertOwner(session, "Only owners can manage channels");

    return this.channelsService.disconnectChannel(
      session.organizationId,
      session.userId,
      id,
    );
  }

  private assertOwner(session: SessionPayload, message: string) {
    if (session.role !== Role.OWNER) {
      throw new ForbiddenException(message);
    }
  }
}
