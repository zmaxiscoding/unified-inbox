import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { SessionPayload } from "./auth.types";
import { SessionService } from "./session.service";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<
      Request & { session?: SessionPayload }
    >();
    const session = this.sessionService.parseCookie(request.headers.cookie);

    if (!session) {
      throw new UnauthorizedException("Authentication required");
    }

    request.session = session;
    return true;
  }
}
