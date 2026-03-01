import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module";

describe("AppModule DI wiring", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret";
  });

  it("should compile AppModule when SESSION_SECRET is set", async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(module).toBeDefined();
  });
});
