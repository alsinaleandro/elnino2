"use client";

import { useState } from "react";
import { AYUDA, BARRIO, CHAT, DELEGADOS, LOCALIDAD, NOVEDADES, VECINOS_EN_EL_BARRIO, type Pedido } from "./datos";
import styles from "./maqueta.module.css";

// "¡Organizate!" (Idea 1): aceptación, ingreso y datos; y "Mi barrio" con novedades, chat,
// delegados (Idea 3) y ayuda mutua (Idea 6). Todo con datos de ejemplo, nada se guarda.

export type Usuario = {
  nombre: string;
  apellido: string;
  whatsapp: string;
  barrio: string;
  delegadoSeguido: number | null;
  esDelegado: boolean;
};

const iniciales = (nombre: string) =>
  nombre
    .split(" ")
    .map((parte) => parte[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

// ---------- Pantalla de aceptación ----------

export function Aceptacion({ onAceptar, onCancelar }: { onAceptar: () => void; onCancelar: () => void }) {
  return (
    <div className={styles.legal}>
      <h1>Sumate al comité de emergencia de tu barrio</h1>
      <p className={styles.notState}>
        Esta iniciativa <strong>no es del Estado</strong>: es un esfuerzo de organización vecinal coordinado por el{" "}
        <strong>PTP Chaco</strong>.
      </p>
      <p>
        Cuando el agua sube, los que primero ayudan son los vecinos. Esta sección es para organizarnos barrio por barrio:
        conocernos, avisarnos y estar preparados.
      </p>

      <h2>¿Qué vas a hacer?</h2>
      <p>Vas a formar parte del comité de emergencia de tu barrio, junto a otros vecinos que también se sumaron.</p>

      <h2>¿Quiénes pueden sumarse?</h2>
      <p>
        Personas <strong>mayores de 18 años</strong>.
      </p>

      <h2>¿Qué datos te vamos a pedir?</h2>
      <ul>
        <li>Nombre y apellido</li>
        <li>E-mail (podés entrar con tu cuenta de Google)</li>
        <li>WhatsApp</li>
        <li>Barrio (lo detectamos con tu ubicación, y podés corregirlo)</li>
      </ul>
      <p>
        Los usamos solo para armar la comunidad de tu barrio y para contactarte por temas del comité. No los vendemos ni
        los compartimos con nadie, tampoco con el gobierno.
      </p>

      <h2>¿Qué ven los demás vecinos?</h2>
      <ul>
        <li>
          En el chat de tu barrio se ve tu <strong>nombre y la inicial de tu apellido</strong>.
        </li>
        <li>
          Tu teléfono y tu e-mail <strong>no los ve ningún otro vecino</strong>.
        </li>
        <li>
          A qué delegado seguís <strong>no lo ve ningún vecino ni delegado</strong>.
        </li>
        <li>No hay mensajes privados entre vecinos: todo se habla en el chat del barrio, a la vista de todos.</li>
      </ul>

      <h2>Delegados</h2>
      <p>
        Cualquier vecino puede postularse como delegado de su barrio, y cada vecino elige libremente a un delegado para
        seguir. Si te postulás como delegado,{" "}
        <strong>tu nombre y tu WhatsApp se publican para los vecinos de tu barrio</strong>, y los conoce el PTP Chaco para
        coordinar entre barrios.
      </p>

      <h2>Novedades</h2>
      <p>
        Vas a ver un panel de novedades publicadas por el <strong>PTP Chaco</strong>. No son comunicados del gobierno ni de
        organismos del Estado. Para alertas oficiales, seguí siempre al SMN, Defensa Civil y tu municipio.
      </p>

      <h2>Quién es responsable de tus datos</h2>
      <p>
        Los datos los guarda el <strong>PTP Chaco (Partido del Trabajo y del Pueblo)</strong>, que administra esta app.
        Para conocer el mapa de los barrios organizados, el PTP usa <strong>cantidades por barrio</strong>, no datos de
        cada vecino.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Darnos tus datos es voluntario, pero sin ellos no podés sumarte al comité. Podés pedir verlos, corregirlos o
        borrarlos cuando quieras, y salir del comité desde la app o escribiendo a <strong>[e-mail de contacto]</strong>.
      </p>
      <small>
        Tenés derecho a acceder a tus datos en forma gratuita cada seis meses (art. 14, Ley 25.326). La Agencia de Acceso a
        la Información Pública, como órgano de control de la Ley 25.326, atiende las denuncias y reclamos por
        incumplimiento de las normas de protección de datos personales.
      </small>

      <p>
        Al tocar &quot;Estoy de acuerdo&quot; confirmás que <strong>tenés 18 años o más</strong> y que leíste esta
        información.
      </p>
      <button type="button" className={styles.btnPrimary} onClick={onAceptar}>
        Estoy de acuerdo
      </button>
      <button type="button" className={styles.btnGhost} onClick={onCancelar}>
        Ahora no
      </button>
    </div>
  );
}

// ---------- Ingreso y datos ----------

export function Ingreso({ onListo }: { onListo: (usuario: Usuario) => void }) {
  const [paso, setPaso] = useState<"ingreso" | "datos">("ingreso");
  const [nombre, setNombre] = useState("María");
  const [apellido, setApellido] = useState("López");
  const [whatsapp, setWhatsapp] = useState("3624 00-0000");
  const [barrio, setBarrio] = useState(BARRIO);

  if (paso === "ingreso") {
    return (
      <div className={styles.legal}>
        <h1>Ingresá</h1>
        <p className={styles.muted}>Usamos tu cuenta solo para identificarte. No publicamos nada en tu nombre.</p>
        <button type="button" className={styles.googleBtn} onClick={() => setPaso("datos")}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continuar con Google
        </button>
        <div className={styles.divider}>o</div>
        <label className={styles.field}>
          E-mail
          <input type="email" placeholder="tu@email.com" />
        </label>
        <button type="button" className={styles.btnSecondary} onClick={() => setPaso("datos")}>
          Recibir un link para entrar
        </button>
      </div>
    );
  }

  return (
    <div className={styles.legal}>
      <h1>Tus datos</h1>
      <label className={styles.field}>
        Nombre
        <input value={nombre} onChange={(event) => setNombre(event.target.value)} />
      </label>
      <label className={styles.field}>
        Apellido
        <input value={apellido} onChange={(event) => setApellido(event.target.value)} />
      </label>
      <label className={styles.field}>
        WhatsApp
        <input inputMode="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} />
      </label>
      <label className={styles.field}>
        Barrio
        <select value={barrio} onChange={(event) => setBarrio(event.target.value)}>
          <option>{BARRIO}</option>
          <option>Villa Centenario</option>
          <option>Güiraldes</option>
          <option>Mujeres Argentinas</option>
          <option>Otro (escribirlo)</option>
        </select>
      </label>
      <p className={styles.muted}>
        📍 Detectamos <strong>{BARRIO}</strong> ({LOCALIDAD}) con tu ubicación. Si vivís en otro barrio, cambialo: tiene
        que ser donde vivís, no donde estás ahora.
      </p>
      <button
        type="button"
        className={styles.btnPrimary}
        onClick={() => onListo({ nombre, apellido, whatsapp, barrio, delegadoSeguido: null, esDelegado: false })}
      >
        Sumarme al comité
      </button>
    </div>
  );
}

// ---------- Mi barrio ----------

type Sub = "novedades" | "chat" | "delegados" | "ayuda";

export function MiBarrio({ usuario, onCambiar }: { usuario: Usuario; onCambiar: (usuario: Usuario) => void }) {
  const [sub, setSub] = useState<Sub>("novedades");
  const [mensajes, setMensajes] = useState(CHAT.map((mensaje) => ({ ...mensaje, mio: false })));
  const [texto, setTexto] = useState("");
  const [pedidos, setPedidos] = useState<Pedido[]>(AYUDA);
  const [postulando, setPostulando] = useState(false);
  const [nuevoPedido, setNuevoPedido] = useState<{ tipo: Pedido["tipo"]; texto: string; contacto: boolean } | null>(null);

  const yo = `${usuario.nombre} ${usuario.apellido[0] ?? ""}.`;
  const delegados = [
    ...DELEGADOS,
    ...(usuario.esDelegado
      ? [{ id: 99, nombre: `${usuario.nombre} ${usuario.apellido}`, seguidores: 0, whatsapp: usuario.whatsapp, desde: "hoy" }]
      : []),
  ];

  const enviar = () => {
    if (!texto.trim()) return;
    setMensajes([...mensajes, { autor: yo, delegado: usuario.esDelegado, texto: texto.trim(), hora: "ahora", mio: true }]);
    setTexto("");
  };

  return (
    <>
      <div className={styles.barrioHead}>
        <strong>{usuario.barrio}</strong>
        <span>
          Comité de emergencia · {VECINOS_EN_EL_BARRIO} vecinos · {delegados.length} delegados
        </span>
      </div>

      <div className={styles.subtabs} role="tablist">
        {(
          [
            ["novedades", "Novedades"],
            ["chat", "Chat"],
            ["delegados", "Delegados"],
            ["ayuda", "Ayuda"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={sub === key}
            className={`${styles.subtab} ${sub === key ? styles.subtabActive : ""}`}
            onClick={() => setSub(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {sub === "novedades" ? (
        <>
          {NOVEDADES.map((novedad) => (
            <article key={novedad.titulo} className={`${styles.card} ${styles.cardStatic}`}>
              <div className={styles.row} style={{ justifyContent: "space-between" }}>
                <span className={styles.ptpTag}>PTP Chaco</span>
                <span className={styles.muted}>{novedad.hace}</span>
              </div>
              <strong>{novedad.titulo}</strong>
              <p className={styles.cardSub}>{novedad.texto}</p>
            </article>
          ))}
          <p className={styles.muted}>
            Novedades del PTP Chaco, no comunicados oficiales. Para alertas oficiales seguí al SMN, Defensa Civil y tu
            municipio.
          </p>
        </>
      ) : null}

      {sub === "chat" ? (
        <>
          <p className={styles.muted}>
            Chat público del barrio: lo leen todos los vecinos del comité. No hay mensajes privados.
          </p>
          <div className={styles.chat}>
            {mensajes.map((mensaje, index) => (
              <div key={index} className={`${styles.msg} ${mensaje.mio ? styles.msgMine : ""}`}>
                <div className={styles.msgAuthor}>
                  {mensaje.autor}
                  {mensaje.delegado ? <span className={styles.delegadoTag}>Delegado/a</span> : null}
                  <span className={styles.msgTime}>{mensaje.hora}</span>
                </div>
                {mensaje.texto}
              </div>
            ))}
          </div>
          <form
            className={styles.chatInput}
            onSubmit={(event) => {
              event.preventDefault();
              enviar();
            }}
          >
            <input value={texto} onChange={(event) => setTexto(event.target.value)} placeholder="Escribí al barrio..." />
            <button type="submit" className={`${styles.btnPrimary} ${styles.btnSmall}`}>
              Enviar
            </button>
          </form>
        </>
      ) : null}

      {sub === "delegados" ? (
        <>
          <p className={styles.muted}>
            Elegí a <strong>un</strong> delegado para seguir, o a ninguno. Podés cambiarlo cuando quieras. Nadie del barrio
            ve a quién seguís.
          </p>
          {delegados.map((delegado) => {
            const soyYo = delegado.id === 99;
            const sigo = usuario.delegadoSeguido === delegado.id;
            const seguidores = delegado.seguidores + (sigo ? 1 : 0);
            return (
              <div key={delegado.id} className={`${styles.card} ${styles.cardStatic} ${sigo ? styles.following : ""}`}>
                <div className={styles.delegado}>
                  <span className={styles.initials}>{iniciales(delegado.nombre)}</span>
                  <div>
                    <strong>
                      {delegado.nombre}
                      {soyYo ? " (vos)" : ""}
                    </strong>
                    <p className={styles.muted}>
                      {seguidores} {seguidores === 1 ? "seguidor" : "seguidores"} · delegado/a desde {delegado.desde}
                    </p>
                  </div>
                </div>
                <div className={styles.row}>
                  <span className={`${styles.chip} ${styles.chipNeutral}`}>💬 {delegado.whatsapp}</span>
                  {soyYo ? (
                    <button
                      type="button"
                      className={`${styles.btnSecondary} ${styles.btnSmall}`}
                      onClick={() => onCambiar({ ...usuario, esDelegado: false })}
                    >
                      Renunciar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${sigo ? styles.btnSecondary : styles.btnPrimary} ${styles.btnSmall}`}
                      onClick={() => onCambiar({ ...usuario, delegadoSeguido: sigo ? null : delegado.id })}
                    >
                      {sigo ? "Siguiendo ✓" : "Seguir"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!usuario.esDelegado ? (
            <button type="button" className={styles.btnSecondary} onClick={() => setPostulando(true)}>
              Postularme como delegado/a
            </button>
          ) : null}
          <p className={styles.muted}>En la maqueta los números de WhatsApp son inventados y no abren ningún chat.</p>
        </>
      ) : null}

      {sub === "ayuda" ? (
        <>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setNuevoPedido({ tipo: "necesito", texto: "", contacto: false })}
          >
            ＋ Publicar
          </button>
          {pedidos.map((pedido, index) => (
            <div key={index} className={`${styles.card} ${styles.cardStatic}`}>
              <div className={styles.row} style={{ justifyContent: "space-between" }}>
                <span className={`${styles.chip} ${pedido.tipo === "ofrezco" ? styles.ofrezco : styles.necesito}`}>
                  {pedido.tipo === "ofrezco" ? "Ofrezco" : "Necesito"}
                </span>
                <span className={styles.muted}>
                  {pedido.autor} · {pedido.hace}
                </span>
              </div>
              <p>{pedido.texto}</p>
              {pedido.contacto ? (
                <div className={styles.row}>
                  <span className={`${styles.chip} ${styles.chipNeutral}`}>📞 Llamar</span>
                  <span className={`${styles.chip} ${styles.chipNeutral}`}>💬 WhatsApp {pedido.contacto}</span>
                </div>
              ) : (
                <p className={styles.muted}>Contactalo por el chat del barrio o a través de un delegado.</p>
              )}
            </div>
          ))}
        </>
      ) : null}

      {postulando ? (
        <>
          <div className={styles.sheetBackdrop} onClick={() => setPostulando(false)} />
          <div className={styles.sheet} role="dialog" aria-label="Postularme como delegado">
            <h2>Postularme como delegado/a</h2>
            <p>
              Si te postulás, <strong>tu nombre y tu WhatsApp ({usuario.whatsapp}) se publican</strong> para los vecinos de{" "}
              {usuario.barrio}, y los conoce el PTP Chaco para coordinar entre barrios.
            </p>
            <p className={styles.muted}>Podés renunciar cuando quieras: tus datos dejan de ser públicos.</p>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                onCambiar({ ...usuario, esDelegado: true });
                setPostulando(false);
              }}
            >
              Me postulo
            </button>
            <button type="button" className={styles.btnGhost} onClick={() => setPostulando(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : null}

      {nuevoPedido ? (
        <>
          <div className={styles.sheetBackdrop} onClick={() => setNuevoPedido(null)} />
          <div className={styles.sheet} role="dialog" aria-label="Publicar en ayuda mutua">
            <h2>Publicar en ayuda mutua</h2>
            <div className={styles.options}>
              {(["necesito", "ofrezco"] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  className={`${styles.option} ${nuevoPedido.tipo === tipo ? styles.optionActive : ""}`}
                  onClick={() => setNuevoPedido({ ...nuevoPedido, tipo })}
                >
                  <strong>{tipo === "necesito" ? "Necesito" : "Ofrezco"}</strong>
                  <small>{tipo === "necesito" ? "Pedí ayuda a tus vecinos" : "Ofrecé lo que puedas"}</small>
                </button>
              ))}
            </div>
            <label className={styles.field}>
              ¿Qué {nuevoPedido.tipo === "necesito" ? "necesitás" : "ofrecés"}?
              <textarea
                rows={3}
                value={nuevoPedido.texto}
                onChange={(event) => setNuevoPedido({ ...nuevoPedido, texto: event.target.value })}
              />
            </label>
            {nuevoPedido.tipo === "necesito" ? (
              <label className={styles.toggle}>
                <div>
                  <strong>Permitir que me contacten directo</strong>
                  <small>Se muestra tu WhatsApp ({usuario.whatsapp}) en esta publicación, para llamada o mensaje.</small>
                </div>
                <input
                  type="checkbox"
                  checked={nuevoPedido.contacto}
                  onChange={(event) => setNuevoPedido({ ...nuevoPedido, contacto: event.target.checked })}
                />
              </label>
            ) : null}
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={!nuevoPedido.texto.trim()}
              onClick={() => {
                setPedidos([
                  {
                    tipo: nuevoPedido.tipo,
                    autor: yo,
                    texto: nuevoPedido.texto.trim(),
                    hace: "recién",
                    contacto: nuevoPedido.contacto ? usuario.whatsapp : undefined,
                  },
                  ...pedidos,
                ]);
                setNuevoPedido(null);
              }}
            >
              Publicar
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
