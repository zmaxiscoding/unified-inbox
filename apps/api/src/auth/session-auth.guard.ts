import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { SessionPayload } from "./auth.types";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<
      Request & { session?: SessionPayload }
    >();
    const response = context.switchToHttp().getResponse<Response>();
    const session = this.sessionService.parseCookie(request.headers.cookie);

    if (!session) {
      throw new UnauthorizedException("Authentication required");
    }

    try {
      await this.authService.getSessionDetails(session);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        response.setHeader("Set-Cookie", this.sessionService.clearSessionCookie());
        throw new UnauthorizedException("Authentication required");
      }

      throw error;
    }

    request.session = session;
    return true;
  }
}
