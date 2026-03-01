import { IsUUID, ValidateIf } from "class-validator";

export class AssignConversationDto {
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  membershipId!: string | null;
}
