"use client";

import type { ReactNode } from "react";

// Botón de envío que pide confirmación antes de mandar el formulario (para acciones sin vuelta atrás).
export default function ConfirmButton({
  message,
  className,
  name,
  value,
  children,
}: {
  message: string;
  className?: string;
  name: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
