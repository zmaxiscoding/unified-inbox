import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Response } from "express";
import { Session } from "./session.decorator";
import { SessionPayload } from "./auth.types";
import { SessionAuthGuard } from "./session-auth.guard";
import { AuthService } from "./auth.service";
import { BootstrapOwnerDto } from "./dto/bootstrap-owner.dto";
import { LoginDto } from "./dto/login.dto";
import { RecoverOwnerDto } from "./dto/recover-owner.dto";
import { SessionService } from "./session.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Post("login")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);

    if (result.requiresOrganizationSelection) {
      return result;
    }

    res.setHeader("Set-Cookie", this.sessionService.createSessionCookie(result.session));
    return {
      requiresOrganizationSelection: false as const,
      user: result.user,
      organization: result.organization,
    };
  }

  @Get("bootstrap/status")
  getBootstrapStatus() {
    return this.authService.getBootstrapStatus();
  }

  @Post("bootstrap")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async bootstrap(
    @Body() dto: BootstrapOwnerDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.bootstrapOwner(dto);

    res.setHeader("Set-Cookie", this.sessionService.createSessionCookie(result.session));
    return {
      user: result.user,
      organization: result.organization,
    };
  }

  @Post("recover-owner")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async recoverOwner(
    @Body() dto: RecoverOwnerDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.recoverOwnerAccess(dto);

    res.setHeader("Set-Cookie", this.sessionService.createSessionCookie(result.session));
    return {
      user: result.user,
      organization: result.organization,
    };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.setHeader("Set-Cookie", this.sessionService.clearSessionCookie());
    return { ok: true };
  }

  @Get("session")
  @UseGuards(SessionAuthGuard)
  async session(@Session() session: SessionPayload) {
    const details = await this.authService.getSessionDetails(session);

    return {
      user: details.user,
      organization: details.organization,
    };
  }
}
