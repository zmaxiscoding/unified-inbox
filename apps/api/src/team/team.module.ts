import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TeamController } from "./team.controller";
import { InvitesController } from "./invites.controller";
import { MembershipsController } from "./memberships.controller";
import { TeamService } from "./team.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TeamController, InvitesController, MembershipsController],
  providers: [TeamService],
})
export class TeamModule {}
