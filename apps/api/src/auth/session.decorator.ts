import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import { SessionPayload } from "./auth.types";

export const Session = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionPayload => {
    const request = ctx.switchToHttp().getRequest<
      Request & { session?: SessionPayload }
    >();
    return request.session as SessionPayload;
  },
);
