import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const LAST_90_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

type DecodedCursor = {
  id: string;
  createdAt: Date;
};

type CursorPayload = {
  id: string;
  createdAt: string;
};

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(organizationId: string, query: ListAuditLogsQueryDto) {
    const now = new Date();
    const minFromDate = new Date(now.getTime() - LAST_90_DAYS_MS);

    const requestedFrom = query.from ? new Date(query.from) : minFromDate;
    const requestedTo = query.to ? new Date(query.to) : now;

    if (query.from && query.to && requestedFrom > requestedTo) {
      throw new BadRequestException("from must be before to");
    }

    const from = requestedFrom < minFromDate ? minFromDate : requestedFrom;
    const boundedTo = requestedTo > now ? now : requestedTo;
    const to = boundedTo < minFromDate ? minFromDate : boundedTo;

    if (from > to) {
      throw new BadRequestException("from must be before to");
    }

    const limit = this.normalizeLimit(query.limit);

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      action: query.action,
      actorId: query.actorId,
      createdAt: {
        gte: from,
        lte: to,
      },
    };

    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            {
              createdAt: cursor.createdAt,
              id: { lt: cursor.id },
            },
          ],
        },
      ];
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        action: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const paginatedRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = paginatedRows[paginatedRows.length - 1];

    return {
      items: paginatedRows.map((row) => ({
        id: row.id,
        timestamp: row.createdAt,
        action: row.action,
        targetId: row.targetId,
        metadata: row.metadata,
        actor: {
          id: row.actor.id,
          name: row.actor.name,
          email: row.actor.email,
        },
      })),
      pageInfo: {
        limit,
        hasMore,
        nextCursor: hasMore && lastRow ? this.encodeCursor(lastRow) : null,
      },
      range: {
        from,
        to,
      },
    };
  }

  private normalizeLimit(limit?: number) {
    if (typeof limit !== "number" || Number.isNaN(limit)) {
      return DEFAULT_LIMIT;
    }

    return Math.min(Math.max(limit, 1), MAX_LIMIT);
  }

  private encodeCursor(row: { id: string; createdAt: Date }) {
    const payload: CursorPayload = {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
    };
    return Buffer.from(JSON.stringify(payload)).toString("base64url");
  }

  private decodeCursor(cursor: string): DecodedCursor {
    try {
      const raw = Buffer.from(cursor, "base64url").toString("utf8");
      const parsed = JSON.parse(raw) as Partial<CursorPayload>;

      if (typeof parsed.id !== "string" || parsed.id.trim().length === 0) {
        throw new Error("invalid cursor id");
      }
      if (typeof parsed.createdAt !== "string") {
        throw new Error("invalid cursor timestamp");
      }

      const createdAt = new Date(parsed.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        throw new Error("invalid cursor date");
      }

      return {
        id: parsed.id,
        createdAt,
      };
    } catch {
      throw new BadRequestException("Invalid cursor");
    }
  }
}
