"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Mientras hay una carga de barrios en curso, vuelve a pedir la página cada unos segundos.
export default function ImportRefresher({ running }: { running: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [running, router]);

  return null;
}
