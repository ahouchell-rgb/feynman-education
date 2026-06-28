"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/sk";
import { C } from "@/lib/theme";

export function AuthGate({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.18em", color: C.dim, textTransform: "uppercase" }}>Loading…</div>
      </div>
    );
  }

  if (!user) return null;
  return children;
}
