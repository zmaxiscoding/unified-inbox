import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { firstValueFrom } from "rxjs";
import { Request } from "express";

describe("EventsController", () => {
  let controller: EventsController;
  let eventsService: EventsService;

  beforeEach(() => {
    eventsService = new EventsService();
    controller = new EventsController(eventsService);
  });

  afterEach(() => {
    eventsService.onModuleDestroy();
  });

  it("should return SSE stream that emits org-scoped events", async () => {
    const mockReq = {
      on: jest.fn(),
    } as unknown as Request;

    const session = {
      userId: "user_1",
      organizationId: "org_1",
      iat: 0,
      exp: 0,
    };

    const observable = controller.stream(session, mockReq);

    // Emit an event after subscribing
    setTimeout(() => {
      eventsService.emit("org_1", {
        type: "message.created",
        conversationId: "conv_1",
        payload: { text: "hello" },
      });
    }, 10);

    const messageEvent = await firstValueFrom(observable);
    expect(messageEvent.type).toBe("message.created");
    expect(JSON.parse(messageEvent.data as string)).toEqual({
      type: "message.created",
      conversationId: "conv_1",
      payload: { text: "hello" },
    });
  });
});
