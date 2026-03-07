import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Session } from "../auth/session.decorator";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { AddTagDto } from "./dto/add-tag.dto";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { CreateMessageDto } from "./dto/create-message.dto";
import { CreateNoteDto } from "./dto/create-note.dto";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { UpdateStatusDto } from "./dto/update-status.dto";
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
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  getConversations(
    @Session() session: SessionPayload,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.conversationsService.listConversations(
      session.organizationId,
      {
        status: query.status,
        search: query.search,
        assignedTo: query.assignedTo,
      },
    );
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

  @Get(":id/tags")
  getConversationTags(
    @Param("id") id: string,
    @Session() session: SessionPayload,
  ) {
    return this.conversationsService.listConversationTags(
      session.organizationId,
      id,
    );
  }

  @Post(":id/tags")
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  addTag(
    @Param("id") id: string,
    @Body() body: AddTagDto,
    @Session() session: SessionPayload,
  ) {
    return this.conversationsService.addTagToConversation(
      session.organizationId,
      id,
      body.name,
    );
  }

  @Delete(":id/tags/:tagId")
  @HttpCode(204)
  removeTag(
    @Param("id") id: string,
    @Param("tagId") tagId: string,
    @Session() session: SessionPayload,
  ) {
    return this.conversationsService.removeTagFromConversation(
      session.organizationId,
      id,
      tagId,
    );
  }

  @Get(":id/notes")
  getConversationNotes(
    @Param("id") id: string,
    @Session() session: SessionPayload,
  ) {
    return this.conversationsService.listConversationNotes(
      session.organizationId,
      id,
    );
  }

  @Post(":id/notes")
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  createNote(
    @Param("id") id: string,
    @Body() body: CreateNoteDto,
    @Session() session: SessionPayload,
  ) {
    return this.conversationsService.createConversationNote(
      session.organizationId,
      session.userId,
      id,
      body.body,
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

  @Patch(":id/status")
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  updateStatus(
    @Param("id") id: string,
    @Body() body: UpdateStatusDto,
    @Session() session: SessionPayload,
  ) {
    return this.conversationsService.updateConversationStatus(
      session.organizationId,
      session.userId,
      id,
      body.status,
    );
  }
}
