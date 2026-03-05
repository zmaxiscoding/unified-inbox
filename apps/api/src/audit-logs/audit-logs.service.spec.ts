import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogsService } from "./audit-logs.service";

describe("AuditLogsService", () => {
  let service: AuditLogsService;
  let prisma: {
    auditLog: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-05T12:00:00.000Z"));

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

  it("should list only organization audit logs from last 90 days by default", async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: "log_1",
        action: "conversation.assigned",
        targetId: "conv_1",
        metadata: { assignedTo: "usr_2" },
        createdAt: new Date("2026-03-05T11:00:00.000Z"),
        actor: { id: "usr_1", name: "Ali Yılmaz", email: "owner@acme.com" },
      },
    ]);

    const result = await service.listAuditLogs("org_1", {});

    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(1);
    const args = prisma.auditLog.findMany.mock.calls[0][0] as {
      where: {
        organizationId: string;
        createdAt: {
          gte: Date;
          lte: Date;
        };
      };
      orderBy: Array<Record<string, "desc">>;
      take: number;
    };

    expect(args.where.organizationId).toBe("org_1");
    expect(args.where.createdAt.gte).toEqual(new Date("2025-12-05T12:00:00.000Z"));
    expect(args.where.createdAt.lte).toEqual(new Date("2026-03-05T12:00:00.000Z"));
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.take).toBe(26);

    expect(result).toEqual({
      items: [
        {
          id: "log_1",
          timestamp: new Date("2026-03-05T11:00:00.000Z"),
          action: "conversation.assigned",
          targetId: "conv_1",
          metadata: { assignedTo: "usr_2" },
          actor: {
            id: "usr_1",
            name: "Ali Yılmaz",
            email: "owner@acme.com",
          },
        },
      ],
      pageInfo: {
        limit: 25,
        hasMore: false,
        nextCursor: null,
      },
      range: {
        from: new Date("2025-12-05T12:00:00.000Z"),
        to: new Date("2026-03-05T12:00:00.000Z"),
      },
    });
  });

  it("should apply action/actor/date filters and decoded cursor", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);

    const cursor = Buffer.from(
      JSON.stringify({
        id: "log_cursor",
        createdAt: "2026-02-01T10:00:00.000Z",
      }),
    ).toString("base64url");

    await service.listAuditLogs("org_1", {
      action: "conversation.assigned",
      actorId: "cjfne4n3f0000qzrmn831i7rn",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-03-01T00:00:00.000Z",
      cursor,
      limit: 10,
    });

    const args = prisma.auditLog.findMany.mock.calls[0][0] as {
      where: {
        action?: string;
        actorId?: string;
        createdAt: {
          gte: Date;
          lte: Date;
        };
        AND?: unknown[];
      };
      take: number;
    };

    expect(args.where.action).toBe("conversation.assigned");
    expect(args.where.actorId).toBe("cjfne4n3f0000qzrmn831i7rn");
    expect(args.where.createdAt).toEqual({
      gte: new Date("2026-01-01T00:00:00.000Z"),
      lte: new Date("2026-03-01T00:00:00.000Z"),
    });
    expect(args.where.AND).toEqual([
      {
        OR: [
          {
            createdAt: {
              lt: new Date("2026-02-01T10:00:00.000Z"),
            },
          },
          {
            createdAt: new Date("2026-02-01T10:00:00.000Z"),
            id: { lt: "log_cursor" },
          },
        ],
      },
    ]);
    expect(args.take).toBe(11);
  });

  it("should return opaque nextCursor when there is another page", async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: "log_1",
        action: "invite.created",
        targetId: "inv_1",
        metadata: null,
        createdAt: new Date("2026-03-05T11:00:00.000Z"),
        actor: { id: "usr_1", name: "Ali Yılmaz", email: "owner@acme.com" },
      },
      {
        id: "log_2",
        action: "member.removed",
        targetId: "mem_2",
        metadata: null,
        createdAt: new Date("2026-03-04T11:00:00.000Z"),
        actor: { id: "usr_1", name: "Ali Yılmaz", email: "owner@acme.com" },
      },
      {
        id: "log_3",
        action: "tag.added",
        targetId: "conv_1",
        metadata: null,
        createdAt: new Date("2026-03-03T11:00:00.000Z"),
        actor: { id: "usr_1", name: "Ali Yılmaz", email: "owner@acme.com" },
      },
    ]);

    const result = await service.listAuditLogs("org_1", { limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.pageInfo.hasMore).toBe(true);
    expect(result.pageInfo.nextCursor).toBeTruthy();

    const decoded = JSON.parse(
      Buffer.from(result.pageInfo.nextCursor as string, "base64url").toString("utf8"),
    ) as {
      id: string;
      createdAt: string;
    };

    expect(decoded).toEqual({
      id: "log_2",
      createdAt: "2026-03-04T11:00:00.000Z",
    });
  });

  it("should enforce max limit guard", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);

    const result = await service.listAuditLogs("org_1", { limit: 1000 });
    const args = prisma.auditLog.findMany.mock.calls[0][0] as { take: number };

    expect(args.take).toBe(101);
    expect(result.pageInfo.limit).toBe(100);
  });

  it("should reject from date greater than to date", async () => {
    await expect(
      service.listAuditLogs("org_1", {
        from: "2026-03-05T12:00:00.000Z",
        to: "2026-03-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("should reject invalid cursor payload", async () => {
    await expect(
      service.listAuditLogs("org_1", { cursor: "not-base64" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
