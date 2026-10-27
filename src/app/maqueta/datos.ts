// Datos de ejemplo de la maqueta (/maqueta). Nada de esto sale de la base de datos.

export const BARRIO = "Villa Barberán";
export const LOCALIDAD = "Resistencia";

// Ubicación simulada del vecino, en Villa Barberán.
export const UBICACION: [number, number] = [-27.4705, -58.9975];

export const ZONA = { rio: "Zona de Restricción Leve", lluvia: "Zona de Restricción Severa" };

export const RIO = { altura: 6.82, alerta: 6.4, evacuacion: 7.0, variacion: "+0,04 m", tendencia: "CRECE" };

export const PROXIMA_LLUVIA = { dia: "jueves 29", mm: 40, probabilidad: 80 };

export type Estado = "sin-agua" | "anegada" | "intransitable";
export type Causa = "lluvia" | "crecida";

export const ESTADOS: Record<Estado, { label: string; color: string }> = {
  "sin-agua": { label: "Sin agua", color: "#16a34a" },
  anegada: { label: "Anegada", color: "#2563eb" },
  intransitable: { label: "Intransitable", color: "#dc2626" },
};

export const CAUSAS: Record<Causa, { label: string; duracion: string; horas: number }> = {
  lluvia: { label: "Precipitaciones", duracion: "12 horas", horas: 12 },
  crecida: { label: "Crecida del río", duracion: "4 días", horas: 96 },
};

export type Actualizacion = { estado: Estado; autor: string; haceMin: number };

export type Reporte = {
  id: number;
  lugar: string;
  causa: Causa;
  // Punto, tramo de calle o zona.
  forma: { tipo: "punto"; punto: [number, number] } | { tipo: "tramo" | "zona"; puntos: [number, number][] };
  historial: Actualizacion[]; // de la más reciente a la más antigua
  fotos: number;
};

export const REPORTES: Reporte[] = [
  {
    id: 1,
    lugar: "Av. Sarmiento y Av. Alvear",
    causa: "lluvia",
    forma: { tipo: "punto", punto: [-27.4622, -58.9933] },
    historial: [
      { estado: "anegada", autor: "Marta G.", haceMin: 40 },
      { estado: "intransitable", autor: "Carlos R.", haceMin: 300 },
    ],
    fotos: 2,
  },
  {
    id: 2,
    lugar: "Calle Pellegrini, del 1800 al 2100",
    causa: "lluvia",
    forma: {
      tipo: "tramo",
      puntos: [
        [-27.4688, -59.0012],
        [-27.4712, -58.9969],
      ],
    },
    historial: [{ estado: "intransitable", autor: "Luis P.", haceMin: 90 }],
    fotos: 1,
  },
  {
    id: 3,
    lugar: "Barrio Toba, sector norte",
    causa: "crecida",
    forma: {
      tipo: "zona",
      puntos: [
        [-27.4555, -58.9672],
        [-27.4549, -58.9618],
        [-27.4593, -58.9606],
        [-27.4601, -58.9664],
      ],
    },
    historial: [
      { estado: "anegada", autor: "Delegada Rosa M.", haceMin: 600 },
      { estado: "anegada", autor: "Pedro S.", haceMin: 2880 },
    ],
    fotos: 3,
  },
  {
    id: 4,
    lugar: "Av. 25 de Mayo y Juan B. Justo",
    causa: "lluvia",
    forma: { tipo: "punto", punto: [-27.4489, -59.0011] },
    historial: [
      { estado: "sin-agua", autor: "Ana L.", haceMin: 60 },
      { estado: "anegada", autor: "Jorge T.", haceMin: 420 },
    ],
    fotos: 0,
  },
];

export const NOVEDADES = [
  {
    titulo: "Reunión del comité este sábado",
    texto: "Nos juntamos el sábado a las 17 h en la capilla del barrio para organizar el relevamiento de familias en zona baja.",
    hace: "hace 2 h",
  },
  {
    titulo: "El Paraná sigue creciendo",
    texto: "Prefectura informa 6,82 m en Barranqueras. Revisá tu plan familiar y tené lista la mochila de emergencia.",
    hace: "ayer",
  },
  {
    titulo: "Jornada de limpieza de desagües",
    texto: "Gracias a los 23 vecinos que participaron el domingo. Se limpiaron 14 cuadras de cunetas.",
    hace: "hace 3 días",
  },
];

export const CHAT = [
  { autor: "Rosa M.", delegado: true, texto: "Buen día vecinos. ¿Alguien sabe si pasó el camión atmosférico por la calle Pellegrini?", hora: "08:12" },
  { autor: "Carlos R.", delegado: false, texto: "Pasó ayer a la tarde, pero la esquina sigue con agua.", hora: "08:20" },
  { autor: "Marta G.", delegado: false, texto: "En Sarmiento ya bajó bastante, se puede pasar despacio.", hora: "08:41" },
  { autor: "Luis P.", delegado: false, texto: "Cargué un reporte de la calle Pellegrini con fotos.", hora: "09:05" },
];

export type Delegado = { id: number; nombre: string; seguidores: number; whatsapp: string; desde: string };

export const DELEGADOS: Delegado[] = [
  { id: 1, nombre: "Rosa Medina", seguidores: 21, whatsapp: "3624 55-1234", desde: "agosto 2026" },
  { id: 2, nombre: "Héctor Fernández", seguidores: 14, whatsapp: "3624 66-9876", desde: "septiembre 2026" },
  { id: 3, nombre: "Julia Aquino", seguidores: 0, whatsapp: "3624 77-4567", desde: "hoy" },
];

export const VECINOS_EN_EL_BARRIO = 47;

export type Pedido = {
  tipo: "ofrezco" | "necesito";
  autor: string;
  texto: string;
  hace: string;
  contacto?: string; // solo si la persona permitió el contacto directo
};

export const AYUDA: Pedido[] = [
  { tipo: "necesito", autor: "Elena V.", texto: "Ayuda para subir los muebles, vivo sola y tengo 78 años.", hace: "hace 1 h", contacto: "3624 12-3456" },
  { tipo: "ofrezco", autor: "Ramón D.", texto: "Tengo canoa, puedo ayudar a trasladar personas o cosas.", hace: "hace 3 h" },
  { tipo: "ofrezco", autor: "Silvia C.", texto: "Puedo alojar una familia con chicos por unos días.", hace: "ayer" },
  { tipo: "necesito", autor: "Familia Gómez", texto: "Necesitamos leña y agua potable.", hace: "ayer", contacto: "3624 98-7654" },
];

// Tareas del plan familiar (Idea 4), tomadas de la guía "Antes de que llegue el agua".
export const PLAN_FAMILIAR = [
  { id: "encuentro", texto: "Acordamos un punto de encuentro de la familia" },
  { id: "telefonos", texto: "Anotamos los teléfonos importantes (familia, delegado, emergencias)" },
  { id: "documentos", texto: "Guardamos los documentos en una bolsa impermeable" },
  { id: "mochila", texto: "Armamos la mochila de emergencia" },
  { id: "mascotas", texto: "Sabemos qué hacer con las mascotas" },
  { id: "evacuar", texto: "Sabemos a dónde ir si hay que evacuar" },
  { id: "corte", texto: "Sabemos cómo cortar la luz y el gas" },
  { id: "elevar", texto: "Subimos a lo alto lo que el agua puede arruinar" },
];
