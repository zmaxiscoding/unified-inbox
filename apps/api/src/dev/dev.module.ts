import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { DevController } from "./dev.controller";
import { DevService } from "./dev.service";

@Module({
  imports: [PrismaModule, AuthModule, WebhooksModule],
  controllers: [DevController],
  providers: [DevService],
})
export class DevModule {}
