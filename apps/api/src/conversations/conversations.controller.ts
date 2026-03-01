import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { CreateMessageDto } from "./dto/create-message.dto";
import { ConversationsService } from "./conversations.service";

@Controller("conversations")
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  getConversations() {
    return this.conversationsService.listConversations();
  }

  @Get(":id/messages")
  getConversationMessages(@Param("id") id: string) {
    return this.conversationsService.listConversationMessages(id);
  }

  @Post(":id/messages")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  createMessage(@Param("id") id: string, @Body() body: CreateMessageDto) {
    return this.conversationsService.createOutboundMessage(id, body.text);
  }
}
