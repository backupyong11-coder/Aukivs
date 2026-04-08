import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DemoLoginForm } from "./DemoLoginForm";

function isGated(): boolean {
  return Boolean(process.env.DEMO_PIN?.trim());
}

export default async function DemoLoginPage() {
  if (!isGated()) {
    redirect("/");
  }

  const jar = await cookies();
  if (jar.get("demo_auth")?.value === "ok") {
    redirect("/");
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-full flex-1 items-center justify-center text-sm text-zinc-500">
          불러오는 중…
        </div>
      }
    >
      <DemoLoginForm />
    </Suspense>
  );
}
