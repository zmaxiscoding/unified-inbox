import { IsIn } from "class-validator";

export class UpdateConversationStatusDto {
  @IsIn(["OPEN", "RESOLVED"], {
    message: "status must be OPEN or RESOLVED",
  })
  status!: "OPEN" | "RESOLVED";
}
