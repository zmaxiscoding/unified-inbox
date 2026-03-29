import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthEmailDeliveryService } from "./auth-email-delivery.service";
import { AuthService } from "./auth.service";
import { SessionAuthGuard } from "./session-auth.guard";
import { SessionService } from "./session.service";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthEmailDeliveryService,
    AuthService,
    SessionService,
    SessionAuthGuard,
  ],
  exports: [AuthService, SessionAuthGuard, SessionService],
})
export class AuthModule {}
