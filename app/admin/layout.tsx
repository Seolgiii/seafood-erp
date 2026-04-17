"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readSession, isSessionExpired, isAdminRole } from "@/lib/session";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const session = readSession();
    if (!session || isSessionExpired(session)) {
      router.replace("/login");
      return;
    }
    if (!isAdminRole(session)) {
      router.replace("/");
      return;
    }
    setAllowed(true);
  }, [router]);

  if (!allowed) return null;

  return <>{children}</>;
}
