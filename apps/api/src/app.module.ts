import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { ConversationsModule } from "./conversations/conversations.module";

@Module({
  imports: [HealthModule, ConversationsModule],
})
export class AppModule {}
