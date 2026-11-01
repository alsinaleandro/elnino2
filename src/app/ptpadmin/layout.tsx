import type { Metadata } from "next";

// Panel de administración: que los buscadores no lo indexen. A otros sitios (tiles de OpenStreetMap,
// WhatsApp, mapas) les llega solo el dominio de la app, sin la ruta del panel. No usar "no-referrer":
// OpenStreetMap bloquea (403) los pedidos de tiles que llegan sin Referer.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "strict-origin-when-cross-origin",
};

export default function AdminLayout({ children }: LayoutProps<"/ptpadmin">) {
  return children;
}
