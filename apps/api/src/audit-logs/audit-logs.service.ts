import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto";

const DEFAULT_LIMIT = 20;
const MAX_LOOKBACK_DAYS = 90;
const CURSOR_SEPARATOR = "::";
const CUID_REGEX = /^c[a-z0-9]{24}$/i;

type ParsedCursor = {
  createdAt: Date;
  id: string;
};

type AuditLogListItem = {
  id: string;
  createdAt: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  actor: {
    id: string;
    name: string;
  };
};

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(organizationId: string, query: ListAuditLogsQueryDto) {
    const now = new Date();
    const earliestAllowedDate = this.getEarliestAllowedDate(now);

    const requestedFrom = query.from
      ? this.parseDate(query.from, "from")
      : earliestAllowedDate;
    const requestedTo = query.to ? this.parseDate(query.to, "to") : now;

    if (requestedFrom > requestedTo) {
      throw new BadRequestException("from must be less than or equal to to");
    }

    const effectiveFrom =
      requestedFrom < earliestAllowedDate ? earliestAllowedDate : requestedFrom;
    if (effectiveFrom > requestedTo) {
      return {
        items: [] as AuditLogListItem[],
        nextCursor: null as string | null,
        availableActions: [] as string[],
      };
    }

    const cursor = query.cursor ? this.parseCursor(query.cursor) : null;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const baseWhere = {
      organizationId,
      createdAt: {
        gte: effectiveFrom,
        lte: requestedTo,
      },
      ...(query.action ? { action: query.action } : {}),
    };

    const where =
      cursor === null
        ? baseWhere
        : {
            ...baseWhere,
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              {
                createdAt: cursor.createdAt,
                id: { lt: cursor.id },
              },
            ],
          };

    const auditLogs = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        createdAt: true,
        action: true,
        targetId: true,
        metadata: true,
        actor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const hasMore = auditLogs.length > limit;
    const pageItems = hasMore ? auditLogs.slice(0, limit) : auditLogs;

    const nextCursor =
      hasMore && pageItems.length > 0
        ? this.encodeCursor(pageItems[pageItems.length - 1].createdAt, pageItems[pageItems.length - 1].id)
        : null;

    const actions = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        createdAt: {
          gte: effectiveFrom,
          lte: requestedTo,
        },
      },
      distinct: ["action"],
      orderBy: {
        action: "asc",
      },
      select: {
        action: true,
      },
    });

    return {
      items: pageItems.map((auditLog) => ({
        id: auditLog.id,
        createdAt: auditLog.createdAt.toISOString(),
        action: auditLog.action,
        targetId: auditLog.targetId,
        metadata: this.toMetadataObject(auditLog.metadata),
        actor: {
          id: auditLog.actor.id,
          name: auditLog.actor.name,
        },
      })),
      nextCursor,
      availableActions: actions.map((action) => action.action),
    };
  }

  private getEarliestAllowedDate(now: Date) {
    const value = new Date(now);
    value.setDate(value.getDate() - MAX_LOOKBACK_DAYS);
    return value;
  }

  private parseDate(value: string, field: "from" | "to") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        `${field} must be a valid ISO 8601 datetime`,
      );
    }

    return parsed;
  }

  private parseCursor(cursor: string): ParsedCursor {
    const separatorIndex = cursor.lastIndexOf(CURSOR_SEPARATOR);
    if (separatorIndex <= 0 || separatorIndex >= cursor.length - CURSOR_SEPARATOR.length) {
      throw new BadRequestException("Invalid cursor format");
    }

    const createdAtRaw = cursor.slice(0, separatorIndex);
    const id = cursor.slice(separatorIndex + CURSOR_SEPARATOR.length);

    if (!CUID_REGEX.test(id)) {
      throw new BadRequestException("Invalid cursor format");
    }

    const createdAt = this.parseDate(createdAtRaw, "from");
    return { createdAt, id };
  }

  private encodeCursor(createdAt: Date, id: string) {
    return `${createdAt.toISOString()}${CURSOR_SEPARATOR}${id}`;
  }

  private toMetadataObject(value: unknown) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
