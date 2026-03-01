import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Session } from "../auth/session.decorator";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { CreateMessageDto } from "./dto/create-message.dto";
import { ConversationsService } from "./conversations.service";

@Controller("conversations")
@UseGuards(SessionAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get("members")
  getOrganizationMembers(@Session() session: SessionPayload) {
    return this.conversationsService.listOrganizationMembers(
      session.organizationId,
    );
  }

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

  @Patch(":id/assign")
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  assignConversation(
    @Param("id") id: string,
    @Body() body: AssignConversationDto,
    @Session() session: SessionPayload,
  ) {
    return this.conversationsService.assignConversation(
      session.organizationId,
      session.userId,
      id,
      body.membershipId,
    );
  }
}
