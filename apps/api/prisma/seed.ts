import {
  PrismaClient,
  Role,
  ChannelType,
  ConversationStatus,
  MessageDirection,
  OutboundMessageDeliveryStatus,
} from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DEMO_OWNER_PASSWORD = "OwnerPass123!";
const DEMO_AGENT_PASSWORD = "AgentPass123!";

async function main() {
  // Clean existing seed data (idempotent re-run)
  await prisma.organization.deleteMany({ where: { slug: "acme-store" } });
  await prisma.user.deleteMany({ where: { email: { in: ["owner@acme.com", "agent@acme.com"] } } });

  // Organization
  const org = await prisma.organization.create({
    data: { name: "Acme Store", slug: "acme-store" },
  });

  const [ownerPasswordHash, agentPasswordHash] = await Promise.all([
    bcrypt.hash(DEMO_OWNER_PASSWORD, 12),
    bcrypt.hash(DEMO_AGENT_PASSWORD, 12),
  ]);

  // Users
  const owner = await prisma.user.create({
    data: {
      email: "owner@acme.com",
      name: "Ali Yılmaz",
      passwordHash: ownerPasswordHash,
    },
  });
  const agent = await prisma.user.create({
    data: {
      email: "agent@acme.com",
      name: "Zeynep Demir",
      passwordHash: agentPasswordHash,
    },
  });

  // Memberships (create individually to capture IDs for conversation assignment)
  const ownerMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: owner.id, role: Role.OWNER },
  });
  const agentMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: agent.id, role: Role.AGENT },
  });

  // Channels
  const whatsapp = await prisma.channel.create({
    data: { type: ChannelType.WHATSAPP, name: "WhatsApp Business", organizationId: org.id },
  });
  const instagram = await prisma.channel.create({
    data: { type: ChannelType.INSTAGRAM, name: "Instagram DM", organizationId: org.id },
  });

  // Tags
  const vipTag = await prisma.tag.create({
    data: { name: "VIP", organizationId: org.id },
  });
  await prisma.tag.create({
    data: { name: "İade", organizationId: org.id },
  });

  // Conversation 1 — WhatsApp, assigned
  const conv1 = await prisma.conversation.create({
    data: {
      contactName: "Mehmet Kaya",
      contactPhone: "+905551234567",
      status: ConversationStatus.OPEN,
      isUnread: true,
      lastMessageAt: new Date(),
      lastMessageText: "Siparişim ne zaman kargoya verilecek?",
      organizationId: org.id,
      channelId: whatsapp.id,
      assignedMembershipId: agentMembership.id,
    },
  });

  await prisma.message.createMany({
    data: [
      {
        direction: MessageDirection.INBOUND,
        body: "Merhaba, sipariş #1042 hakkında bilgi alabilir miyim?",
        providerMessageId: "wa_msg_001",
        conversationId: conv1.id,
      },
      {
        direction: MessageDirection.OUTBOUND,
        body: "Merhaba Mehmet Bey, siparişiniz hazırlanıyor.",
        providerMessageId: "wa_msg_002",
        deliveryStatus: OutboundMessageDeliveryStatus.SENT,
        deliveryStatusUpdatedAt: new Date(),
        sentAt: new Date(),
        conversationId: conv1.id,
        senderId: agent.id,
      },
      {
        direction: MessageDirection.INBOUND,
        body: "Siparişim ne zaman kargoya verilecek?",
        providerMessageId: "wa_msg_003",
        conversationId: conv1.id,
      },
    ],
  });

  await prisma.conversationTag.create({
    data: { conversationId: conv1.id, tagId: vipTag.id },
  });

  await prisma.note.create({
    data: {
      body: "Müşteri daha önce 3 sipariş vermiş, VIP olarak işaretlendi.",
      conversationId: conv1.id,
      authorId: agent.id,
    },
  });

  // Conversation 2 — Instagram, unassigned
  const conv2 = await prisma.conversation.create({
    data: {
      contactName: "Ayşe Çelik",
      status: ConversationStatus.OPEN,
      isUnread: true,
      lastMessageAt: new Date(Date.now() - 3600_000),
      lastMessageText: "Bu ürün stokta var mı?",
      organizationId: org.id,
      channelId: instagram.id,
    },
  });

  await prisma.message.create({
    data: {
      direction: MessageDirection.INBOUND,
      body: "Bu ürün stokta var mı?",
      providerMessageId: "ig_msg_001",
      conversationId: conv2.id,
    },
  });

  // Conversation 3 — Resolved
  await prisma.conversation.create({
    data: {
      contactName: "Fatma Şahin",
      contactPhone: "+905559876543",
      status: ConversationStatus.RESOLVED,
      isUnread: false,
      lastMessageAt: new Date(Date.now() - 86400_000),
      lastMessageText: "Teşekkürler, sorun çözüldü!",
      organizationId: org.id,
      channelId: whatsapp.id,
      assignedMembershipId: ownerMembership.id,
    },
  });

  // Audit log entries
  await prisma.auditLog.createMany({
    data: [
      {
        action: "member.invited",
        targetId: agent.id,
        metadata: { email: "agent@acme.com", role: "AGENT" },
        organizationId: org.id,
        actorId: owner.id,
      },
      {
        action: "conversation.assigned",
        targetId: conv1.id,
        metadata: { assignedTo: agent.id },
        organizationId: org.id,
        actorId: owner.id,
      },
      {
        action: "tag.added",
        targetId: conv1.id,
        metadata: { tag: "VIP" },
        organizationId: org.id,
        actorId: agent.id,
      },
    ],
  });

  // Sample invitation
  const sampleToken = randomBytes(32).toString("hex");
  const sampleTokenHash = createHash("sha256").update(sampleToken).digest("hex");

  await prisma.invitation.create({
    data: {
      email: "newagent@acme.com",
      role: Role.AGENT,
      tokenHash: sampleTokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      organizationId: org.id,
      createdByMembershipId: ownerMembership.id,
    },
  });

  console.log("Seed completed: 1 org, 2 users, 2 channels, 3 conversations, 4 messages, 2 tags, 1 note, 1 invitation, 3 audit logs");
  console.log(`Seed login (owner): owner@acme.com / ${DEMO_OWNER_PASSWORD}`);
  console.log(`Seed login (agent): agent@acme.com / ${DEMO_AGENT_PASSWORD}`);
  console.log(`Sample invite token (for testing): ${sampleToken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
