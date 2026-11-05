"use server";

import { headers } from "next/headers";
import { saveEnquiry, type EnquiryResult } from "@/lib/enquiry";
import { env } from "@/lib/env";

export async function submitEnquiry(_previous: EnquiryResult, formData: FormData) {
  const ip = (await headers()).get(env.CLIENT_IP_HEADER) ?? "unknown";
  return saveEnquiry(Object.fromEntries(formData), ip);
}
