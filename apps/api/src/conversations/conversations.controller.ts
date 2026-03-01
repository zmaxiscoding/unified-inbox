import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Session } from "../auth/session.decorator";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CreateMessageDto } from "./dto/create-message.dto";
import { ConversationsService } from "./conversations.service";

@Controller("conversations")
@UseGuards(SessionAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  getConversations(@Session() session: SessionPayload) {
    return this.conversationsService.listConversations(session.organizationId);
  }

  @Get(":id/messages")
  getConversationMessages(
    @Param("id") id: string,
    @Session() session: SessionPayload,
  ) {
    return this.conversationsService.listConversationMessages(
      session.organizationId,
      id,
    );
  }

  @Post(":id/messages")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  createMessage(
    @Param("id") id: string,
    @Body() body: CreateMessageDto,
    @Session() session: SessionPayload,
  ) {
    return this.conversationsService.createOutboundMessage(
      session.organizationId,
      session.userId,
      id,
      body.text,
    );
  }
}
