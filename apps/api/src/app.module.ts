import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { TeamModule } from "./team/team.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ChannelsModule } from "./channels/channels.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { DevModule } from "./dev/dev.module";
import { AuditLogsModule } from "./audit-logs/audit-logs.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ConversationsModule,
    TeamModule,
    ChannelsModule,
    AuditLogsModule,
    WebhooksModule,
    DevModule,
  ],
})
export class AppModule {}
