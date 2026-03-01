import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

function assertRequiredEnv() {
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required");
  }
}

async function bootstrap() {
  assertRequiredEnv();
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();
