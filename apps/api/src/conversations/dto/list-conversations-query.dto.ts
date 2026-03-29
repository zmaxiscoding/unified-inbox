import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ListConversationsQueryDto {
  @IsOptional()
  @IsIn(["OPEN", "RESOLVED"], {
    message: "status must be OPEN or RESOLVED",
  })
  status?: "OPEN" | "RESOLVED";

  @IsOptional()
  @IsIn(["WHATSAPP", "INSTAGRAM"], {
    message: "channel must be WHATSAPP or INSTAGRAM",
  })
  channel?: "WHATSAPP" | "INSTAGRAM";

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  tagId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
