import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Session } from "../auth/session.decorator";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { TeamService } from "./team.service";
import { UpdateRoleDto } from "./dto/update-role.dto";

@Controller("memberships")
@UseGuards(SessionAuthGuard)
export class MembershipsController {
  constructor(private readonly teamService: TeamService) {}

  @Patch(":id/role")
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  updateRole(
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto,
    @Session() session: SessionPayload,
  ) {
    return this.teamService.updateMemberRole(
      session.organizationId,
      session.userId,
      id,
      dto.role,
    );
  }

  @Delete(":id")
  @HttpCode(204)
  removeMember(
    @Param("id") id: string,
    @Session() session: SessionPayload,
  ) {
    return this.teamService.removeMember(
      session.organizationId,
      session.userId,
      id,
    );
  }
}
