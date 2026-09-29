export function sellerContacts() {
  return {
    email: process.env.CONTACT_EMAIL?.trim() || "",
    phone: process.env.CONTACT_PHONE?.trim() || "",
    name: process.env.LEGAL_NAME?.trim() || "",
    inn: process.env.LEGAL_INN?.trim() || "",
    ogrn: process.env.LEGAL_OGRN?.trim() || "",
    address: process.env.LEGAL_ADDRESS?.trim() || "",
  };
}
