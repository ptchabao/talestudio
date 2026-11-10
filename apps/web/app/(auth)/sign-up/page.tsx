import { AuthForm } from "@/components/auth-form";
import { getDictionary } from "@/i18n/server";
import { Suspense } from "react";

export async function generateMetadata() {
  return { title: (await getDictionary()).auth.createAccount };
}

export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="sign-up" googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID)} />
    </Suspense>
  );
}
