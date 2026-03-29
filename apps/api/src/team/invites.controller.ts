import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "../auth/auth.service";
import { Session } from "../auth/session.decorator";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { SessionService } from "../auth/session.service";
import { TeamService } from "./team.service";
import { CreateInviteDto } from "./dto/create-invite.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";

@Controller("invites")
export class InvitesController {
  constructor(
    private readonly teamService: TeamService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsedSession = this.sessionService.parseCookie(req.headers.cookie);
    let currentSession: SessionPayload | undefined;

    if (parsedSession) {
      try {
        await this.authService.getSessionDetails(parsedSession);
        currentSession = parsedSession;
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          res.setHeader("Set-Cookie", this.sessionService.clearSessionCookie());
        } else {
          throw error;
        }
      }
    }

    const result = await this.teamService.acceptInvite(dto.token, {
      currentSession,
      name: dto.name,
      password: dto.password,
    });

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
