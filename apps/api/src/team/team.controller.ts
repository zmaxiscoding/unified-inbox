import { Controller, ForbiddenException, Get, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Session } from "../auth/session.decorator";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { TeamService } from "./team.service";

@Controller("team")
@UseGuards(SessionAuthGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  getTeam(@Session() session: SessionPayload) {
    this.assertOwner(session);
    return this.teamService.getTeam(session.organizationId);
  }

  private assertOwner(session: SessionPayload) {
    if (session.role !== Role.OWNER) {
      throw new ForbiddenException("Only owners can view team settings");
    }
  }
}
