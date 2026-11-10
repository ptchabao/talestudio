/** Public base URL of the app (links in e-mails, payment callbacks). */
export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
