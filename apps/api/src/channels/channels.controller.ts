import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Session } from "../auth/session.decorator";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ConnectWhatsAppChannelDto } from "./dto/connect-whatsapp-channel.dto";
import { ChannelsService } from "./channels.service";

@Controller("channels")
@UseGuards(SessionAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  listChannels(@Session() session: SessionPayload) {
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
    return this.channelsService.connectWhatsAppChannel(
      session.organizationId,
      session.userId,
      body,
    );
  }
}
