// Enlaces para contactar o ubicar a quien dejó un mensaje (panel de administración y e-mails).

// wa.me pide el número internacional: 54 + 9 + característica + número, sin 0 ni 15.
export function whatsappLink(number: string) {
  const digits = number.replace(/\D/g, "");
  if (digits.startsWith("549")) return `https://wa.me/${digits}`;
  if (digits.startsWith("54")) return `https://wa.me/549${digits.slice(2)}`;
  if (digits.length === 11 && digits.startsWith("0")) return `https://wa.me/549${digits.slice(1)}`;
  if (digits.length === 10) return `https://wa.me/549${digits}`;
  return null;
}

export const mapLink = (latitude: number, longitude: number) =>
  `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
