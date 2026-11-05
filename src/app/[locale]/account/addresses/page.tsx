import { AddressManager } from "@/components/account/address-manager";
import { getContent } from "@/content";
import { listAddresses, MAX_ADDRESSES } from "@/lib/booking/customer";
import { requirePermission } from "@/lib/dal";

export default async function AddressesPage({ params }: PageProps<"/[locale]/account/addresses">) {
  const { locale } = await params;
  const { user } = await requirePermission("address.manage_own", locale);
  const content = getContent(locale);
  const addresses = await listAddresses(user.id);

  return (
    <AddressManager
      addresses={addresses}
      max={MAX_ADDRESSES}
      labels={content.account.addresses}
      tile={content.account.addTile}
      count={content.account.addressesCount.replace("{count}", String(addresses.length)).replace("{max}", String(MAX_ADDRESSES))}
      fields={content.booking.details}
      errors={content.account.detail.errors}
    />
  );
}
