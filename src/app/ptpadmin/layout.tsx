import type { Metadata } from "next";

// Panel de administración: que los buscadores no lo indexen y que los enlaces externos (mapa,
// WhatsApp) no reciban de dónde vienen.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AdminLayout({ children }: LayoutProps<"/ptpadmin">) {
  return children;
}
