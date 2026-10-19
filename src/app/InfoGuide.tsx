import Image from "next/image";
import backpackImage from "../../public/images/mochila-emergencia.jpg";
import styles from "./page.module.css";

// Pestaña Información: resumen de "Antes de que llegue el agua. Guía de preparación familiar frente
// al riesgo hídrico" (Rico, Botteron, Don, Marega, 2026; licencia CC BY-NC 4.0, exige citar la
// fuente). El contenido se ordena en las cinco fases de la guía, cada una desplegable.

type Group = { title: string; items: Array<[string, string]> };
type Phase = { id: string; label: string; title: string; intro: string; groups: Group[] };

const PHASES: Phase[] = [
  {
    id: "fase1",
    label: "Fase 1 · Meses antes",
    title: "Adaptar la casa y la familia",
    intro:
      "Es la etapa con más margen de decisión. Lo que no se haga ahora difícilmente se pueda improvisar después.",
    groups: [
      {
        title: "Conocé tu terreno",
        items: [
          ["Hacé un plano de tu casa", "y marcá en él todo lo que pueda ser un peligro si entra agua, también en la vereda y la calle."],
          ["Averiguá la cota de tu terreno", "respecto de la calle y del barrio."],
          ["Observá qué pasa cuando llueve fuerte:", "si el agua se acumula en el terreno, escurre a la calle o entra desde afuera."],
          ["Si vivís detrás de una defensa,", "averiguá su altura y la diferencia con tu terreno: eso define cuánta agua podría entrar si falla."],
          ["Preguntá a los vecinos más antiguos", "hasta dónde llegó el agua en eventos anteriores."],
          ["No tires basura en cunetas ni desagües,", "aunque estén secos: tapa el drenaje."],
        ],
      },
      {
        title: "Medidas en la vivienda",
        items: [
          ["Sellá los ingresos bajos:", "guías en las puertas para colocar tablones o compuertas con burletes, o bolsas de arena."],
          ["Elevá el tablero eléctrico y los tomacorrientes", "por encima del nivel de agua esperable."],
          ["Atá los tanques y garrafas de gas", "a una estructura firme: si flotan, arrancan la cañería y provocan fugas."],
          ["Podá árboles, limpiá cunetas y desagües", "del terreno para que el agua escurra hacia la calle."],
          ["Prepará lugares de guardado en altura", "para objetos de valor y productos peligrosos (pintura, aceite, baterías, pesticidas)."],
        ],
      },
      {
        title: "Un lugar seguro en el predio",
        items: [
          ["Planta alta, terraza o entrepiso firme", "por encima del nivel de agua esperable, idealmente con salida al exterior."],
          ["Debe tener:", "espacio para las personas, agua y comida para 2 a 3 días, un sector cubierto, forma de señalizar la presencia ante un rescate y acceso seguro."],
        ],
      },
      {
        title: "Organizarse",
        items: [
          ["Hablá con tu familia", "sobre la posibilidad de inundarse, con calma y antes de que llegue el agua."],
          ["Revisá las vacunas", "de toda la familia, en especial la antitetánica."],
          ["Conectate con tus vecinos", "para intercambiar contactos y acordar cuidados mutuos."],
          ["Consultá a tu municipio", "si existe un plan de contingencia para tu zona."],
          ["Acordá fuentes de información confiables", "y qué se comparte en los grupos de mensajería."],
        ],
      },
    ],
  },
  {
    id: "fase2",
    label: "Fase 2 · Semanas o días antes",
    title: "Preparar el plan y el equipo",
    intro:
      "Cuando el pronóstico alerta sobre lluvias intensas o crecidas, es momento de activar lo previsto. Un plan de emergencia son decisiones tomadas en calma.",
    groups: [
      {
        title: "Sistema de alertas",
        items: [
          ["Identificá quién emite las alertas", "en tu municipio (Defensa Civil, Protección Civil) y anotá su teléfono."],
          ["Seguí sus canales oficiales", "y suscribite a alertas si existen."],
          ["Aprendé qué significa cada nivel de alerta", "(amarillo, naranja, rojo) para tu zona."],
          ["Identificá caminos seguros, puntos de encuentro y centros de evacuación", "y recorré el camino al menos una vez sin depender del GPS."],
        ],
      },
      {
        title: "Roles en la familia",
        items: [
          ["Definí quién", "toma las decisiones, cuida a niños, mayores o personas con discapacidad, lleva el bolso, corta la luz y el gas y avisa al contacto externo."],
          ["Acordá un punto de encuentro", "fuera de la zona de riesgo por si la familia está separada."],
          ["Practicalo:", "un simulacro familiar breve marca una gran diferencia."],
        ],
      },
      {
        title: "Comunicación",
        items: [
          ["Elegí un contacto central", "fuera de la zona de riesgo como referencia si quedan incomunicados."],
          ["Anotá en papel", "el teléfono de Defensa Civil y del contacto central: el celular se puede mojar o quedar sin batería."],
          ["Acordá con los vecinos una forma de avisarse:", "silbato, golpe en la pared, grupo de mensajería."],
          ["Decidí si alguien se autoevacúa antes,", "incluidos los animales, y a dónde."],
        ],
      },
    ],
  },
  {
    id: "fase3",
    label: "Fase 3 · Durante",
    title: "Actuar con el agua",
    intro:
      "Cuando el agua llega, lo que importa es leer las señales de peligro y decidir con criterio: evacuar o quedarse, a tiempo.",
    groups: [
      {
        title: "Señales que no debés ignorar",
        items: [
          ["El río, arroyo o laguna", "supera las marcas habituales y sigue subiendo."],
          ["El agua aflora desde el suelo", "aunque no llueva: las napas están saturadas."],
          ["Los desagües no escurren", "o devuelven agua hacia adentro."],
          ["Vecinos de zonas más bajas", "ya están evacuando, o Defensa Civil emite una alerta para tu zona."],
          ["El olor del agua cambia:", "puede indicar desagües cloacales colapsados."],
        ],
      },
      {
        title: "Evacuá si…",
        items: [
          ["Hay personas con movilidad reducida,", "niños muy pequeños o adultos mayores."],
          ["Tu vivienda es de planta baja", "sin un nivel superior seguro."],
          ["La inundación es por lluvias intensas", "y el agua puede subir rápido, sin aviso."],
          ["Las autoridades ordenaron evacuar", "tu zona, o no tenés reservas de agua, comida y energía para varios días."],
        ],
      },
      {
        title: "Podés considerar quedarte si…",
        items: [
          ["Tenés planta alta", "o un lugar elevado seguro y autónomo, reservas y comunicación sin electricidad."],
          ["El evento se prevé moderado", "y alguien fuera de la zona sabe que estás ahí, dónde y cuántas personas son."],
        ],
      },
      {
        title: "Si evacuás",
        items: [
          ["No cruces a pie corrientes de más de 30 cm:", "el agua a las rodillas puede derribar a un adulto."],
          ["En calles inundadas, tanteá el piso con un palo:", "puede haber bocas de tormenta abiertas o pozos."],
          ["No uses el auto", "si el agua supera el nivel de los neumáticos."],
          ["Cortá la luz y el gas,", "llevá solo el bolso, documentos y medicamentos, y avisá a tu contacto externo."],
          ["No vuelvas", "hasta que las autoridades lo indiquen."],
        ],
      },
      {
        title: "Si te quedás",
        items: [
          ["Ubicate en el nivel más alto", "de la vivienda y racioná el agua desde el primer momento."],
          ["No tomes agua de red ni de pozo:", "usá solo agua embotellada o potabilizada."],
          ["Informate por radio a pilas", "y guardá la batería del celular para lo esencial."],
          ["Señalizá tu presencia", "con una tela de color visible en el techo o una ventana alta."],
          ["Marcá el nivel del agua en una pared", "para saber si sube o baja."],
          ["No tires residuos ni excretas al agua:", "guardalos en bolsas cerradas en un lugar alto."],
        ],
      },
    ],
  },
  {
    id: "fase4",
    label: "Fase 4 · Días después",
    title: "Volver con seguridad",
    intro:
      "Que el agua se haya retirado no significa que el peligro terminó: puede haber daños estructurales, riesgo eléctrico y contaminación.",
    groups: [
      {
        title: "Antes de entrar",
        items: [
          ["Esperá la autorización oficial", "para regresar a la zona."],
          ["Mirá la casa desde afuera:", "si hay grietas, inclinación, hundimientos o techos caídos, no entres."],
          ["Usá botas y guantes de goma:", "todo lo que tocó el agua está contaminado."],
        ],
      },
      {
        title: "Primeros pasos adentro",
        items: [
          ["Ventilá al menos 15 minutos", "antes de quedarte: puede haber gases acumulados."],
          ["No enciendas la electricidad", "hasta que la revise un electricista, y desenchufá todo antes de volver a encender el tablero."],
          ["No enciendas fuego", "hasta confirmar que no hay fuga de gas."],
          ["Fotografiá y filmá los daños", "antes de mover o limpiar nada."],
        ],
      },
      {
        title: "Riesgos sanitarios",
        items: [
          ["Lavate las manos seguido", "con agua potable y jabón."],
          ["Descartá los alimentos", "que tocaron el agua, aunque estén envasados."],
          ["Desinfectá con lavandina:", "1 parte cada 9 de agua, en pisos, mesadas y paredes hasta la marca del agua."],
          ["Consultá al médico", "ante diarrea, vómitos, irritaciones de piel o problemas respiratorios, y verificá la antitetánica."],
        ],
      },
      {
        title: "Registro y limpieza",
        items: [
          ["Retirá el barro cuanto antes", "para frenar hongos y moho; descartá colchones, almohadones y alfombras que estuvieron sumergidos."],
          ["Registrá los daños en el municipio:", "habilita el acceso a programas de asistencia."],
          ["Si tenés seguro, hacé la denuncia", "y no repares nada hasta que lo vea el perito, salvo lo urgente."],
        ],
      },
    ],
  },
  {
    id: "fase5",
    label: "Fase 5 · Meses después",
    title: "Reconstruir mejor",
    intro:
      "Si reparás exactamente lo que había, la próxima inundación te encuentra igual de expuesto. Aprovechá la reparación para quedar mejor que antes.",
    groups: [
      {
        title: "Qué mejorar al reparar",
        items: [
          ["Elevá el piso interior:", "10 a 15 cm pueden hacer que el agua no entre la próxima vez."],
          ["Reubicá el tablero y los tomacorrientes", "por encima de la marca que dejó el agua."],
          ["Usá revoques hidrófugos o revestimientos cerámicos", "en la parte baja de las paredes."],
          ["Instalá lo que faltó:", "válvula cloacal, guías para compuertas, fijación de los tanques de gas."],
          ["Mejorá el drenaje del terreno", "y ubicá los dormitorios en el sector más alto si reconstruís ambientes."],
        ],
      },
      {
        title: "La recuperación no es solo física",
        items: [
          ["El estrés postraumático es frecuente", "(insomnio, irritabilidad, miedo cuando llueve): si persiste, buscá ayuda profesional."],
          ["Los chicos lo procesan distinto:", "hablá con ellos de lo que pasó, con honestidad y lenguaje acorde a su edad."],
          ["Mantené los vínculos con los vecinos", "y registrá qué funcionó y qué falló: es la base de la preparación para el próximo evento."],
        ],
      },
    ],
  },
];

// Tabla 2 de la guía: bolso para sobrevivir 72 horas con lo mínimo.
const EMERGENCY_BAG: Array<[string, string]> = [
  ["Documentación", "DNI, escritura, póliza de seguro, libreta de vacunación y un listado con los datos de cada integrante, en bolsa hermética."],
  ["Agua", "mínimo 3 litros por persona, pastillas potabilizadoras y un vaso."],
  ["Alimentos", "no perecederos, abrelatas y cubiertos; alimento y remedios para las mascotas."],
  ["Medicamentos", "medicación habitual para al menos 7 días, botiquín y repelente."],
  ["Comunicación y luz", "linterna y radio a pilas, cargador portátil cargado."],
  ["Abrigo", "muda de ropa, poncho o piloto, calzado cerrado impermeable."],
  ["Dinero", "efectivo en billetes chicos: los pagos electrónicos colapsan."],
  ["Higiene", "alcohol en gel, jabón, toallas húmedas, papel higiénico, bolsas."],
  ["Datos clave", "tarjeta con grupo sanguíneo, alergias y contactos de familiares."],
  ["Juguetes", "si hay chicos, alguno de sus favoritos."],
];

// Elementos del esquema de la mochila (imagen), para el texto alternativo.
const BACKPACK_ITEMS = [
  "documentos y llaves",
  "botiquín de primeros auxilios",
  "medicamentos personales",
  "equipo para lluvia",
  "cargador portátil",
  "dinero en efectivo",
  "elementos de aseo",
  "cambio de ropa y calzado",
  "alimentos no perecederos",
  "agua potable",
  "linterna y pilas de repuesto",
  "bolsas plásticas",
  "repelente y protector solar",
];

const LAST_ACTIONS = [
  "Elevá objetos de valor, electrodomésticos, documentos y sustancias peligrosas.",
  "Fotografiá el interior de la casa y los bienes principales.",
  "Tapá desagües y rejillas con bolsas de arena o tapones.",
  "Mové los vehículos a zonas altas y llená el tanque de combustible.",
  "Cargá celulares y el cargador portátil.",
  "Prevé la evacuación de las mascotas.",
  "Guardá o atá los objetos sueltos del patio: con viento se vuelven proyectiles.",
];

// Sitios de interés; se muestran en la pestaña Ayuda (HelpView.tsx).
export const RESOURCES: Array<[string, string]> = [
  ["Instituto Nacional del Agua (INA) · Alerta temprana", "https://www.ina.gov.ar/alerta/"],
  ["Servicio Meteorológico Nacional (SMN)", "https://www.smn.gob.ar/"],
  ["Prefectura Naval Argentina · Altura de los ríos", "https://contenidosweb.prefecturanaval.gob.ar/alturas/"],
  ["Hidroalerta Vilelas", "https://hidrometro.concejovilelas.com/"],
  ["Sistema Nacional de Información Hídrica", "https://snih.hidricosargentina.gob.ar/Filtros.aspx"],
  ["SINAGIR · Sistema Nacional de Gestión Integral del Riesgo", "https://www.argentina.gob.ar/sinagir"],
  ["Instituto Geográfico Nacional (IGN)", "https://www.ign.gob.ar/"],
];

function ItemList({ items }: { items: Array<[string, string]> }) {
  return (
    <ul className={styles.infoList}>
      {items.map(([strong, rest]) => (
        <li key={strong}>
          <strong>{strong}</strong> {rest}
        </li>
      ))}
    </ul>
  );
}

export default function InfoGuide() {
  return (
    <div className={styles.info}>
      <header className={styles.infoHeader}>
        <h2>Qué hacer ante una inundación</h2>
        <p>
          Prepararse no es vivir con miedo: es recuperar el control sobre una situación que, sin preparación, nos
          desborda. Esta guía resume qué hacer antes, durante y después de una inundación. No reemplaza las
          indicaciones de Defensa Civil ni de las autoridades: en una emergencia, seguí siempre sus instrucciones.
        </p>
      </header>

      <section className={styles.infoCard}>
        <h3>Riesgo = Amenaza × Vulnerabilidad</h3>
        <p>
          La amenaza (la lluvia extrema, la crecida) no se puede controlar. La vulnerabilidad, es decir cuán expuestas
          están tu familia y tu vivienda, sí se puede reducir con acciones concretas. Por eso la pestaña Riesgo muestra
          tu zona en dos mapas: cada tipo de inundación se comporta distinto.
        </p>
        <div className={styles.infoCompare}>
          <div>
            <h4>Por crecida de ríos</h4>
            <ul>
              <li>Comienzo lento: días o semanas de aviso.</li>
              <li>Dura semanas a meses.</li>
              <li>Afecta zonas cercanas a ríos, arroyos y lagunas, y zonas detrás de defensas.</li>
              <li>Señales: crecida del río, alertas oficiales, suelo húmedo.</li>
            </ul>
          </div>
          <div>
            <h4>Por lluvias intensas</h4>
            <ul>
              <li>Comienzo rápido: puede ocurrir en horas.</li>
              <li>Dura horas a días.</li>
              <li>Afecta zonas bajas, calles sin desagüe y barrios con napas altas.</li>
              <li>Señales: lluvia intensa y prolongada, suelo saturado.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.infoCard}>
        <h3>Preguntate hoy</h3>
        <ul className={styles.infoList}>
          <li>¿Tu casa o tu barrio se inundaron alguna vez, aunque haya sido hace años?</li>
          <li>¿Vivís detrás de un terraplén o una defensa y creés que eso te protege completamente?</li>
          <li>¿Hay en tu hogar chicos, personas mayores o alguien que depende de medicación diaria?</li>
          <li>Si mañana hubiera una alerta roja, ¿tu familia sabe qué hacer, a dónde ir y qué llevar?</li>
        </ul>
        <p className={styles.infoNote}>
          Si respondiste que sí a alguna de las tres primeras, o que no a la última, sugerimos:
        </p>
      </section>

      <section className={styles.infoCard}>
        <h3>Mochila de emergencia</h3>
        <p>
          Tené lista una mochila con lo indispensable para salir rápido de tu casa. Tocá la imagen para verla en
          tamaño completo.
        </p>
        <a
          className={styles.infoBackpack}
          href="/images/mochila-emergencia.jpg"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            src={backpackImage}
            alt={`Esquema de la mochila de emergencia: ${BACKPACK_ITEMS.join(", ")}. Dejala siempre en un lugar de fácil acceso.`}
            sizes="(max-width: 1100px) 100vw, 1060px"
            placeholder="blur"
          />
        </a>
      </section>

      {PHASES.map((phase, index) => (
        <details key={phase.id} className={styles.infoPhase} open={index === 0}>
          <summary>
            <span>{phase.label}</span>
            <strong>{phase.title}</strong>
          </summary>
          <div className={styles.infoPhaseBody}>
            <p>{phase.intro}</p>
            {phase.groups.map((group) => (
              <div key={group.title}>
                <h4>{group.title}</h4>
                <ItemList items={group.items} />
              </div>
            ))}

            {phase.id === "fase2" ? (
              <>
                <div>
                  <h4>Bolso de emergencia (72 horas)</h4>
                  <p>Cerrado y en un lugar accesible. Revisalo cada 6 meses para reponer lo vencido.</p>
                  <ItemList items={EMERGENCY_BAG} />
                </div>
                <div>
                  <h4>Con la alerta ya emitida: últimas acciones</h4>
                  <ul className={styles.infoList}>
                    {LAST_ACTIONS.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </div>
        </details>
      ))}

      <p className={styles.infoSource}>
        Fuente: Rico J., Botteron A., Don D., Marega J. (2026). <em>Antes de que llegue el agua. Guía de preparación
        familiar frente al riesgo hídrico.</em> Santa Fe, Argentina. Licencia{" "}
        <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener noreferrer">
          CC BY-NC 4.0
        </a>
        . Contacto de los autores: guiariesgohidrico@gmail.com
      </p>
    </div>
  );
}
