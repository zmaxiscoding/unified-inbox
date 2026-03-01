import { Controller, Get, UseGuards } from "@nestjs/common";
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
    return this.teamService.getTeam(session.organizationId);
  }
}
