import { Test, TestingModule } from "@nestjs/testing";
import { SessionPayload } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";

describe("TeamController", () => {
  let controller: TeamController;
  let service: {
    getTeam: jest.Mock;
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
      getTeam: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamController],
      providers: [{ provide: TeamService, useValue: service }],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TeamController>(TeamController);
  });

  it("should list team settings for owners", async () => {
    service.getTeam.mockResolvedValue({ members: [], invites: [] });

    const result = await controller.getTeam(ownerSession);

    expect(result).toEqual({ members: [], invites: [] });
    expect(service.getTeam).toHaveBeenCalledWith("org_1");
  });

  it("should reject team settings reads for non-owners", () => {
    expect(() =>
      controller.getTeam({
        ...ownerSession,
        role: "AGENT",
      }),
    ).toThrow("Only owners can view team settings");

    expect(service.getTeam).not.toHaveBeenCalled();
  });
});
