import { AuthForm } from "@/components/auth-form";
import { getDictionary } from "@/i18n/server";
import { Suspense } from "react";

export async function generateMetadata() {
  return { title: (await getDictionary()).auth.signIn };
}

export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="sign-in" googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID)} />
    </Suspense>
  );
}
