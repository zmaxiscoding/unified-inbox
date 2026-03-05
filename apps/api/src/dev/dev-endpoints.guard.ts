import {
  CanActivate,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

@Injectable()
export class DevEndpointsGuard implements CanActivate {
  canActivate() {
    if (
      process.env.ENABLE_DEV_ENDPOINTS === "true" &&
      process.env.NODE_ENV !== "production"
    ) {
      return true;
    }

    throw new NotFoundException();
  }
}
