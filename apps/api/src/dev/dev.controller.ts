import {
  Body,
  Controller,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Session } from "../auth/session.decorator";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { DevEndpointsGuard } from "./dev-endpoints.guard";
import { DevService } from "./dev.service";
import { SimulateInboundDto } from "./simulate-inbound.dto";

@Controller("dev")
@UseGuards(DevEndpointsGuard, SessionAuthGuard)
export class DevController {
  constructor(private readonly devService: DevService) {}

  @Post("simulate-inbound")
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  simulateInbound(
    @Session() session: SessionPayload,
    @Body() dto: SimulateInboundDto,
  ) {
    return this.devService.simulateInbound(
      session.organizationId,
      dto.text,
      dto.customerDisplay,
    );
  }
}
