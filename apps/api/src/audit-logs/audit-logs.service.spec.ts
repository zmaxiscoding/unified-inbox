import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogsService } from "./audit-logs.service";

const LOG_ID_1 = "cjfne4n3f0000qzrmn831i7ra";
const LOG_ID_2 = "cjfne4n3f0000qzrmn831i7rb";
const LOG_ID_3 = "cjfne4n3f0000qzrmn831i7rc";

describe("AuditLogsService", () => {
  let service: AuditLogsService;
  let prisma: {
    auditLog: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      auditLog: {
        findMany: jest.fn(),
      },
    };

    service = new AuditLogsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should list logs with filters and next cursor", async () => {
    prisma.auditLog.findMany
      .mockResolvedValueOnce([
        {
          id: LOG_ID_1,
          createdAt: new Date("2026-03-05T11:00:00.000Z"),
          action: "invite.created",
          targetId: "inv_1",
          metadata: { email: "agent@acme.com" },
          actor: { id: "u_1", name: "Owner User" },
        },
        {
          id: LOG_ID_2,
          createdAt: new Date("2026-03-05T10:00:00.000Z"),
          action: "invite.created",
          targetId: "inv_2",
          metadata: { email: "owner@acme.com" },
          actor: { id: "u_1", name: "Owner User" },
        },
        {
          id: LOG_ID_3,
          createdAt: new Date("2026-03-05T09:00:00.000Z"),
          action: "invite.created",
          targetId: "inv_3",
          metadata: { email: "third@acme.com" },
          actor: { id: "u_1", name: "Owner User" },
        },
      ])
      .mockResolvedValueOnce([
        { action: "invite.created" },
        { action: "member.removed" },
      ]);

    const result = await service.listAuditLogs("org_1", {
      action: "invite.created",
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-06T00:00:00.000Z",
      limit: 2,
    });

    expect(prisma.auditLog.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org_1",
          action: "invite.created",
          createdAt: {
            gte: new Date("2026-03-01T00:00:00.000Z"),
            lte: new Date("2026-03-06T00:00:00.000Z"),
          },
        }),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 3,
      }),
    );

    expect(prisma.auditLog.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          organizationId: "org_1",
          createdAt: {
            gte: new Date("2026-03-01T00:00:00.000Z"),
            lte: new Date("2026-03-06T00:00:00.000Z"),
          },
        },
        distinct: ["action"],
        orderBy: { action: "asc" },
      }),
    );

    expect(result).toEqual({
      items: [
        {
          id: LOG_ID_1,
          createdAt: "2026-03-05T11:00:00.000Z",
          action: "invite.created",
          targetId: "inv_1",
          metadata: { email: "agent@acme.com" },
          actor: { id: "u_1", name: "Owner User" },
        },
        {
          id: LOG_ID_2,
          createdAt: "2026-03-05T10:00:00.000Z",
          action: "invite.created",
          targetId: "inv_2",
          metadata: { email: "owner@acme.com" },
          actor: { id: "u_1", name: "Owner User" },
        },
      ],
      nextCursor: `2026-03-05T10:00:00.000Z::${LOG_ID_2}`,
      availableActions: ["invite.created", "member.removed"],
    });
  });

  it("should apply cursor pagination conditions", async () => {
    prisma.auditLog.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await service.listAuditLogs("org_1", {
      cursor: `2026-03-05T08:00:00.000Z::${LOG_ID_1}`,
    });

    expect(prisma.auditLog.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org_1",
          OR: [
            { createdAt: { lt: new Date("2026-03-05T08:00:00.000Z") } },
            {
              createdAt: new Date("2026-03-05T08:00:00.000Z"),
              id: { lt: LOG_ID_1 },
            },
          ],
        }),
      }),
    );
  });

  it("should reject invalid cursor formats", async () => {
    await expect(
      service.listAuditLogs("org_1", {
        cursor: "invalid-cursor",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("should reject invalid date ranges", async () => {
    await expect(
      service.listAuditLogs("org_1", {
        from: "2026-03-06T00:00:00.000Z",
        to: "2026-03-05T00:00:00.000Z",
      }),
    ).rejects.toThrow("from must be less than or equal to to");
  });

  it("should clamp from date to the 90-day lookback boundary", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
    prisma.auditLog.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await service.listAuditLogs("org_1", {
      from: "2025-01-01T00:00:00.000Z",
      to: "2026-03-10T12:00:00.000Z",
    });

    const firstCall = prisma.auditLog.findMany.mock.calls[0]?.[0];
    expect(firstCall.where.createdAt).toEqual({
      gte: new Date("2025-12-10T12:00:00.000Z"),
      lte: new Date("2026-03-10T12:00:00.000Z"),
    });
  });
});
