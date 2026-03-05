import { ArgumentMetadata, ForbiddenException, ValidationPipe } from "@nestjs/common";
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

  const session: SessionPayload = {
    userId: "user_1",
    organizationId: "org_1",
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

  it("should list audit logs via service for owner", async () => {
    service.listAuditLogs.mockResolvedValue({
      items: [],
      nextCursor: null,
      availableActions: [],
    });

    const query: ListAuditLogsQueryDto = {
      action: "invite.created",
      limit: 20,
    };

    const result = await controller.listAuditLogs(query, session);

    expect(result).toEqual({
      items: [],
      nextCursor: null,
      availableActions: [],
    });
    expect(service.listAuditLogs).toHaveBeenCalledWith("org_1", query);
  });

  it("should reject non-owner users", async () => {
    expect(() =>
      controller.listAuditLogs({}, { ...session, role: "AGENT" }),
    ).toThrow(ForbiddenException);
    expect(service.listAuditLogs).not.toHaveBeenCalled();
  });

  it("should transform and validate query params", async () => {
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
          action: "  invite.created  ",
          from: "2026-03-01T00:00:00.000Z",
          to: "2026-03-05T00:00:00.000Z",
          cursor: "2026-03-05T00:00:00.000Z::cjfne4n3f0000qzrmn831i7rn",
          limit: "25",
        },
        metadata,
      ),
    ).resolves.toEqual({
      action: "invite.created",
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-05T00:00:00.000Z",
      cursor: "2026-03-05T00:00:00.000Z::cjfne4n3f0000qzrmn831i7rn",
      limit: 25,
    });
  });

  it("should reject invalid limit query", async () => {
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

  it("should reject unknown query fields", async () => {
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
      pipe.transform({ action: "invite.created", extra: "x" }, metadata),
    ).rejects.toThrow();
  });
});
