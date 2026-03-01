import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Response } from "express";
import { Session } from "../auth/session.decorator";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { TeamService } from "./team.service";
import { CreateInviteDto } from "./dto/create-invite.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";

@Controller("invites")
export class InvitesController {
  constructor(private readonly teamService: TeamService) {}

  @Post()
  @UseGuards(SessionAuthGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  createInvite(
    @Body() dto: CreateInviteDto,
    @Session() session: SessionPayload,
  ) {
    return this.teamService.createInvite(
      session.organizationId,
      session.userId,
      dto.email,
      dto.role,
    );
  }

  @Post("accept")
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.teamService.acceptInvite(
      dto.token,
      dto.name,
      dto.password,
    );

    res.setHeader("Set-Cookie", result.sessionCookie);

    return {
      user: result.user,
      organization: result.organization,
    };
  }

  @Delete(":id")
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  revokeInvite(
    @Param("id") id: string,
    @Session() session: SessionPayload,
  ) {
    return this.teamService.revokeInvite(
      session.organizationId,
      session.userId,
      id,
    );
  }
}
