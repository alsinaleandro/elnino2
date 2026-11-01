// "Cómo usamos tus datos": el texto acordado el 24/10/2026 (ver ideas.md, Idea 1). Se muestra antes
// de sumarse y después se puede volver a leer desde la página del vecino.
const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? "elnino@ptpchaco.org.ar";

export default function DatosInfo() {
  return (
    <>
      <h2>¿Qué vas a hacer?</h2>
      <p>Vas a formar parte del comité de emergencia de tu barrio, junto a otros vecinos que también se sumaron.</p>

      <h2>¿Quiénes pueden sumarse?</h2>
      <p>
        Personas <strong>mayores de 18 años</strong>.
      </p>

      <h2>¿Qué datos te vamos a pedir?</h2>
      <ul>
        <li>Nombre y apellido</li>
        <li>
          E-mail (entrás con tu cuenta de Google, o con tu e-mail y una contraseña que guardamos cifrada: nadie puede
          leerla)
        </li>
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
        <li>
          En ayuda mutua, si pedís ayuda y elegís que te contacten directo, <strong>tu WhatsApp se muestra en esa
          publicación</strong> para los vecinos de tu barrio.
        </li>
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
        Vas a ver un panel de novedades publicadas por el <strong>PTP Chaco</strong> y por los{" "}
        <strong>delegados de tu barrio</strong> (por ejemplo, para anunciar reuniones o asambleas). No son comunicados
        del gobierno ni de organismos del Estado. Para alertas oficiales, seguí siempre al SMN, Defensa Civil y tu
        municipio.
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
        borrarlos cuando quieras, y salir del comité desde la app o escribiendo a{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>
          <strong>{CONTACT_EMAIL}</strong>
        </a>
        .
      </p>
      <small>
        Tenés derecho a acceder a tus datos en forma gratuita cada seis meses (art. 14, Ley 25.326). La Agencia de Acceso a
        la Información Pública, como órgano de control de la Ley 25.326, atiende las denuncias y reclamos por
        incumplimiento de las normas de protección de datos personales.
      </small>
    </>
  );
}
