"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getAvailability, placeBooking } from "@/lib/booking/server";
import { getSession } from "@/lib/dal";
import { env } from "@/lib/env";

async function clientIp() {
  return (await headers()).get(env.CLIENT_IP_HEADER) ?? "unknown";
}

const availabilityInput = z.object({
  service: z.string().min(1).max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cleaners: z.number().int().min(1).max(50),
  hours: z.number().int().min(1).max(24),
});

export async function checkAvailability(input: unknown) {
  const parsed = availabilityInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  return getAvailability(parsed.data, await clientIp());
}

export async function createBooking(input: unknown) {
  // A signed-in customer's booking goes to their own account. Staff bookings are treated as guests.
  const current = await getSession();
  const customerId = current?.user.role === "customer" ? current.user.id : undefined;
  return placeBooking(input, { ip: await clientIp(), customerId });
}
