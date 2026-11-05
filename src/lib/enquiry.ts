import { z } from "zod";
import { withActor } from "@/db";
import { enquiry } from "@/db/schema";
import { consume, limits } from "./rate-limit";

const schema = z.object({
  kind: z.enum(["contact", "monthly_contract"]),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,19}$/),
  email: z.email().max(200),
  service: z.string().trim().max(100).optional(),
  area: z.string().trim().max(100).optional(),
  message: z.string().trim().min(10).max(2000),
  propertyType: z.string().trim().max(100).optional(),
  frequency: z.string().trim().max(100).optional(),
});

export type EnquiryResult = "idle" | "success" | "invalid" | "limited" | "failed";

/** Validates and stores an enquiry. Bots that fill the hidden field get a success reply and nothing is saved. */
export async function saveEnquiry(input: Record<string, unknown>, ip: string): Promise<EnquiryResult> {
  if (input.website) return "success";

  const parsed = schema.safeParse(input);
  if (!parsed.success) return "invalid";
  const { propertyType, frequency, ...fields } = parsed.data;

  if (!(await consume(limits.enquiryPerIp, ip))) return "limited";
  if (!(await consume(limits.enquiryPerEmail, fields.email))) return "limited";

  const details = propertyType || frequency ? { propertyType, frequency } : null;
  try {
    await withActor({ role: "anonymous" }, (tx) => tx.insert(enquiry).values({ ...fields, details }));
    return "success";
  } catch {
    return "failed";
  }
}
