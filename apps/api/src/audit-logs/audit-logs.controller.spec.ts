import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { AuditLogsController } from "./audit-logs.controller";
import { AuditLogsService } from "./audit-logs.service";
import { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto";

describe("AuditLogsController", () => {
  let controller: AuditLogsController;
  let service: {
    listAuditLogs: jest.Mock;
  };

  const ownerSession: SessionPayload = {
    userId: "user_1",
    organizationId: "org_1",
    sessionVersion: 0,
    role: "OWNER",
    iat: 1,
    exp: 2,
  };

  beforeEach(async () => {
    service = {
      listAuditLogs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogsController],
      providers: [{ provide: AuditLogsService, useValue: service }],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuditLogsController>(AuditLogsController);
  });

  it("should list audit logs for owner", async () => {
    service.listAuditLogs.mockResolvedValue({ items: [], pageInfo: {}, range: {} });

    const query: ListAuditLogsQueryDto = {
      action: "conversation.assigned",
      limit: 10,
    };

    const result = await controller.listAuditLogs(query, ownerSession);

    expect(result).toEqual({ items: [], pageInfo: {}, range: {} });
    expect(service.listAuditLogs).toHaveBeenCalledWith("org_1", query);
  });

  it("should reject audit log listing for AGENT role", () => {
    expect(() =>
      controller.listAuditLogs(
        {},
        {
          ...ownerSession,
          role: "AGENT",
        },
      ),
    ).toThrow("Only owners can view audit logs");

    expect(service.listAuditLogs).not.toHaveBeenCalled();
  });

  it("should reject invalid from date query", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "query",
      metatype: ListAuditLogsQueryDto,
      data: "",
    };

    await expect(pipe.transform({ from: "not-a-date" }, metadata)).rejects.toThrow();
  });

  it("should reject limit smaller than 1", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "query",
      metatype: ListAuditLogsQueryDto,
      data: "",
    };

    await expect(pipe.transform({ limit: "0" }, metadata)).rejects.toThrow();
  });

  it("should reject query with unknown fields", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "query",
      metatype: ListAuditLogsQueryDto,
      data: "",
    };

    await expect(pipe.transform({ extra: "nope" }, metadata)).rejects.toThrow();
  });

  it("should accept valid query payload", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "query",
      metatype: ListAuditLogsQueryDto,
      data: "",
    };

    await expect(
      pipe.transform(
        {
          action: "conversation.assigned",
          actorId: "cjfne4n3f0000qzrmn831i7rn",
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-03-01T00:00:00.000Z",
          limit: "20",
        },
        metadata,
      ),
    ).resolves.toEqual({
      action: "conversation.assigned",
      actorId: "cjfne4n3f0000qzrmn831i7rn",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-03-01T00:00:00.000Z",
      limit: 20,
    });
  });
});
