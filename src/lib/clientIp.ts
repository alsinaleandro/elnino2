import { headers } from "next/headers";

// IP de quien hace el pedido, para limitar intentos fallidos. Detrás de nginx la IP real llega en
// X-Forwarded-For (la primera de la lista).
export async function clientIp() {
  const store = await headers();
  return store.get("x-forwarded-for")?.split(",")[0]?.trim() || store.get("x-real-ip") || "desconocida";
}

// Intentos fallidos por IP, en memoria (se reinician al reiniciar la app). Pasados `windowMs` desde
// el primer fallo, se empieza a contar de nuevo.
export function createFailureLimiter(maxFailures: number, windowMs: number) {
  const failures = new Map<string, { count: number; since: number }>();

  const current = (ip: string) => {
    const entry = failures.get(ip);
    if (entry && Date.now() - entry.since > windowMs) {
      failures.delete(ip);
      return undefined;
    }
    return entry;
  };

  return {
    isBlocked: (ip: string) => (current(ip)?.count ?? 0) >= maxFailures,
    record(ip: string) {
      const entry = current(ip);
      if (entry) entry.count += 1;
      else failures.set(ip, { count: 1, since: Date.now() });
    },
    clear: (ip: string) => failures.delete(ip),
  };
}
