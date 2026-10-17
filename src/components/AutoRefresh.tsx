"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// R6: while we wait for PayPal's webhook, re-fetch the server data so the page updates by itself.
export default function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
