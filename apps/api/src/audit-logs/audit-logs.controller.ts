import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { Session } from "../auth/session.decorator";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto";
import { AuditLogsService } from "./audit-logs.service";

@Controller("audit-logs")
@UseGuards(SessionAuthGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  listAuditLogs(
    @Query() query: ListAuditLogsQueryDto,
    @Session() session: SessionPayload,
  ) {
    if (session.role !== Role.OWNER) {
      throw new ForbiddenException("Only owners can view audit logs");
    }

    return this.auditLogsService.listAuditLogs(session.organizationId, query);
  }
}
