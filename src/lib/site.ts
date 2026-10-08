export const site = {
  name: "Ferry",
  tagline: "Send files straight to another device",
  description:
    "Send files, folders and text between your devices. Encrypted on your device, sent directly to the other one, with no account and no size cap.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  operator: process.env.NEXT_PUBLIC_OPERATOR_NAME ?? "the operator of this site",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  cliPackage: "ferry-send",
  repo: "https://github.com/sholajegede/ferry",
  productHunt: process.env.NEXT_PUBLIC_PRODUCT_HUNT_URL ?? "",
  productHuntAt: process.env.NEXT_PUBLIC_PRODUCT_HUNT_AT ?? "",
};
