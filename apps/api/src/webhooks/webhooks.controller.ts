import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { WebhooksService } from "./webhooks.service";

function readQueryString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

function readHubQueryString(
  query: Record<string, unknown>,
  flatKey: string,
  nestedKey: "mode" | "verify_token" | "challenge",
): string | undefined {
  const flatValue = readQueryString(query[flatKey]);
  if (flatValue) {
    return flatValue;
  }

  const hubValue = query.hub;
  if (!hubValue || typeof hubValue !== "object" || Array.isArray(hubValue)) {
    return undefined;
  }

  return readQueryString((hubValue as Record<string, unknown>)[nestedKey]);
}

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get("whatsapp")
  verifyWhatsAppWebhook(@Query() query: Record<string, unknown>) {
    const mode = readHubQueryString(query, "hub.mode", "mode");
    const verifyToken = readHubQueryString(query, "hub.verify_token", "verify_token");
    const challenge = readHubQueryString(query, "hub.challenge", "challenge");

    return this.webhooksService.verifyWhatsAppWebhook(mode, verifyToken, challenge);
  }

  @Post("whatsapp")
  @HttpCode(200)
  handleWhatsAppWebhook(
    @Body() payload: unknown,
    @Headers("x-org-id") xOrgIdHeader?: string,
    @Headers("x-hub-signature-256") signatureHeader?: string,
    @Req() request?: RawBodyRequest<Request>,
  ) {
    return this.webhooksService.handleWhatsAppWebhook(payload, {
      xOrgIdHeader,
      signatureHeader,
      rawBody: request?.rawBody,
    });
  }

  @Get("instagram")
  verifyInstagramWebhook(@Query() query: Record<string, unknown>) {
    const mode = readHubQueryString(query, "hub.mode", "mode");
    const verifyToken = readHubQueryString(query, "hub.verify_token", "verify_token");
    const challenge = readHubQueryString(query, "hub.challenge", "challenge");

    return this.webhooksService.verifyInstagramWebhook(mode, verifyToken, challenge);
  }

  @Post("instagram")
  @HttpCode(200)
  handleInstagramWebhook(
    @Body() payload: unknown,
    @Headers("x-org-id") xOrgIdHeader?: string,
    @Headers("x-hub-signature-256") signatureHeader?: string,
    @Req() request?: RawBodyRequest<Request>,
  ) {
    return this.webhooksService.handleInstagramWebhook(payload, {
      xOrgIdHeader,
      signatureHeader,
      rawBody: request?.rawBody,
    });
  }
}
