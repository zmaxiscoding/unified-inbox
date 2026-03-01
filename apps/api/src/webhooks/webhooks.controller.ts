import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post("whatsapp")
  @HttpCode(200)
  handleWhatsAppWebhook(
    @Body() payload: unknown,
    @Headers("x-org-id") xOrgIdHeader?: string,
  ) {
    return this.webhooksService.handleWhatsAppWebhook(payload, xOrgIdHeader);
  }
}
