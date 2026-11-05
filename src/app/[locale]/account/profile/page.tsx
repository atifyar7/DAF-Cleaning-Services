import { notFound } from "next/navigation";
import { initials, when } from "@/components/account/format";
import { ProfileForm } from "@/components/account/profile-form";
import { getContent } from "@/content";
import { getProfile } from "@/lib/booking/customer";
import { requirePermission } from "@/lib/dal";

export default async function ProfilePage({ params }: PageProps<"/[locale]/account/profile">) {
  const { locale } = await params;
  const { user } = await requirePermission("account.view", locale);
  const profile = await getProfile(user.id);
  if (!profile) notFound();
  const content = getContent(locale);
  const account = content.account;

  return (
    <ProfileForm
      profile={{ name: profile.name, email: profile.email, phone: profile.phone ?? "", locale: profile.locale === "ar" ? "ar" : "en" }}
      initials={initials(profile.name, profile.email)}
      deletionRequested={profile.deletionRequestedAt ? when(profile.deletionRequestedAt, content.booking.months, locale).date : null}
      labels={account.profile}
      sections={{ personal: account.personal, signIn: account.signIn, dangerZone: account.dangerZone }}
      errors={account.detail.errors}
    />
  );
}
