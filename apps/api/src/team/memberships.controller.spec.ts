import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { MembershipsController } from "./memberships.controller";
import { TeamService } from "./team.service";
import { UpdateRoleDto } from "./dto/update-role.dto";

describe("MembershipsController", () => {
  let controller: MembershipsController;
  let service: {
    updateMemberRole: jest.Mock;
    removeMember: jest.Mock;
    getTeam: jest.Mock;
    createInvite: jest.Mock;
    acceptInvite: jest.Mock;
    revokeInvite: jest.Mock;
  };
  const session: SessionPayload = {
    userId: "user_1",
    organizationId: "org_1",
    iat: 1,
    exp: 2,
  };

  beforeEach(async () => {
    service = {
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
      getTeam: jest.fn(),
      createInvite: jest.fn(),
      acceptInvite: jest.fn(),
      revokeInvite: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MembershipsController],
      providers: [{ provide: TeamService, useValue: service }],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MembershipsController>(MembershipsController);
  });

  it("should update role via service", async () => {
    service.updateMemberRole.mockResolvedValue({
      membershipId: "mem_1",
      role: "OWNER",
      user: { id: "u1", name: "Test", email: "test@acme.com" },
    });

    const result = await controller.updateRole(
      "mem_1",
      { role: "OWNER" as any },
      session,
    );

    expect(result.role).toBe("OWNER");
    expect(service.updateMemberRole).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "mem_1",
      "OWNER",
    );
  });

  it("should remove member via service", async () => {
    service.removeMember.mockResolvedValue(undefined);

    await controller.removeMember("mem_2", session);

    expect(service.removeMember).toHaveBeenCalledWith(
      "org_1",
      "user_1",
      "mem_2",
    );
  });

  // ── DTO validation tests ─────────────────────────────

  it("should reject invalid role", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: UpdateRoleDto,
      data: "",
    };

    await expect(
      pipe.transform({ role: "SUPERADMIN" }, metadata),
    ).rejects.toThrow();
  });

  it("should reject unknown fields", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: UpdateRoleDto,
      data: "",
    };

    await expect(
      pipe.transform({ role: "OWNER", extra: "nope" }, metadata),
    ).rejects.toThrow();
  });

  it("should accept valid role", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: "body",
      metatype: UpdateRoleDto,
      data: "",
    };

    await expect(
      pipe.transform({ role: "AGENT" }, metadata),
    ).resolves.toEqual({ role: "AGENT" });
  });
});
