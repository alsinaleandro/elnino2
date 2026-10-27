# Ideas del proyecto

Notas de ideas y funcionalidades futuras. Este archivo viaja con git, así que está disponible en cualquier computadora.

## Participación popular

### Idea 1: Comités de barrio (comités de emergencia) con chat vecinal

**Objetivo:** invitar a los visitantes del sitio a organizarse y participar. Los vecinos conforman comités de barrio (o comités de emergencia) para enfrentar el problema de las inundaciones.

**Registro**
- Login con Google o con email.
- Antes de pedir los datos, informar al usuario que se recolectan para conformar y articular los comités de barrio.
- Datos personales: nombre, apellido, email, WhatsApp.
- Barrio y localidad donde vive.

**Detección del barrio**
- Se usan las coordenadas GPS del vecino y la capa GIS de barrios precargada en la app.
- La app detecta automáticamente el barrio del vecino.
- Si el barrio no está en la información cargada, el usuario lo ingresa manualmente y queda guardado en la base de datos de barrios (una tabla específica, o más de una).
- Fuente de la capa de barrios: OpenStreetMap. Cubre la mayor parte de Resistencia con polígonos; falta el microcentro y algunas zonas del borde.

**Carga de barrios a demanda (en vez de descargar las ~70 localidades del Chaco)**
1. Buscar si el punto GPS del vecino cae dentro de algún polígono de la base local. Si cae, ese es su barrio.
2. Si no, consultar a OSM (Overpass API, función `is_in`) qué barrio contiene ese punto. En la misma consulta se obtiene la localidad (límite municipal).
3. Si OSM tiene el polígono, copiarlo completo a la base propia; de ahí en adelante se usa desde la base local.
4. Si OSM no lo tiene, preguntar al vecino el nombre de su barrio (mostrando antes los barrios cercanos ya cargados, para evitar duplicados) y guardar el barrio nuevo junto con el punto del vecino.
- Si Overpass no responde (servicio gratuito, con límites de uso), no trabar el registro: pasar al paso 4 o reintentar después.
- A futuro: con los puntos acumulados de vecinos de un barrio sin polígono, dibujar un polígono aproximado.
- Licencia: los polígonos copiados de OSM siguen bajo ODbL; mostrar la atribución "© OpenStreetMap contributors".

**Chat del barrio**
- Al entrar a la app se conoce la ubicación GPS del vecino.
- La app ofrece un chat grupal con los vecinos del mismo barrio, para organizarse.
- Los mensajes del chat se guardan en la base de datos.
- **No hay mensajes privados dentro de la app.** El chat del barrio es exclusivamente público, y los datos personales de cada vecino permanecen ocultos (decidido el 27/10/2026). La única excepción es el WhatsApp de los delegados (ver Idea 3).

**Puntos a definir más adelante**
- Diferencia entre dónde está el vecino ahora y dónde vive: si se registra desde el trabajo, el GPS daría otro barrio. Conviene que la app proponga el barrio detectado y el usuario lo confirme o lo corrija.
- Privacidad: cumplir la Ley 25.326 de Protección de Datos Personales (consentimiento explícito, finalidad informada, posibilidad de borrar los datos). Definir quién ve el WhatsApp y el email de cada vecino.
- Moderación del chat: qué pasa con mensajes ofensivos o falsos y quién modera cada barrio (¿un coordinador del comité?).
- Barrios ingresados a mano: evitar duplicados con nombres escritos de forma distinta (ej. "Villa Prosperidad" / "V. Prosperidad").

**Pantalla inicial (aceptación de datos)**
- En la portada, un botón "¡Organizate!" lleva a esta pantalla.
- Se muestra una sola vez, antes del registro. Conviene que después se pueda volver a leer desde la sección del barrio ("Cómo usamos tus datos").
- Pendiente: completar el e-mail de contacto.
- No se pide ni se guarda el domicilio: alcanza con el barrio (decidido el 27/10/2026).
- Texto (borrador acordado el 24/10/2026):

> # Sumate al comité de emergencia de tu barrio
>
> Esta iniciativa **no es del Estado**: es un esfuerzo de organización vecinal coordinado por el **PTP Chaco**.
>
> Cuando el agua sube, los que primero ayudan son los vecinos. Esta sección es para organizarnos barrio por barrio: conocernos, avisarnos y estar preparados.
>
> ### ¿Qué vas a hacer?
> Vas a formar parte del comité de emergencia de tu barrio, junto a otros vecinos que también se sumaron.
>
> ### ¿Quiénes pueden sumarse?
> Personas **mayores de 18 años**.
>
> ### ¿Qué datos te vamos a pedir?
> - Nombre y apellido
> - E-mail (podés entrar con tu cuenta de Google)
> - WhatsApp
> - Barrio (lo detectamos con tu ubicación, y podés corregirlo)
>
> Los usamos solo para armar la comunidad de tu barrio y para contactarte por temas del comité. No los vendemos ni los compartimos con nadie, tampoco con el gobierno.
>
> ### ¿Qué ven los demás vecinos?
> - En el chat de tu barrio se ve tu **nombre y la inicial de tu apellido**.
> - Tu teléfono y tu e-mail **no los ve ningún otro vecino**.
> - A qué delegado seguís **no lo ve ningún vecino ni delegado**.
> - No hay mensajes privados entre vecinos: todo se habla en el chat del barrio, a la vista de todos.
>
> ### Delegados
> Cualquier vecino puede postularse como delegado de su barrio, y cada vecino elige libremente a un delegado para seguir. Si te postulás como delegado, **tu nombre y tu WhatsApp se publican para los vecinos de tu barrio**, y los conoce el PTP Chaco para coordinar entre barrios.
>
> ### Novedades
> Vas a ver un panel de novedades publicadas por el **PTP Chaco**. No son comunicados del gobierno ni de organismos del Estado. Para alertas oficiales, seguí siempre al SMN, Defensa Civil y tu municipio.
>
> ### Quién es responsable de tus datos
> Los datos los guarda el **PTP Chaco (Partido del Trabajo y del Pueblo)**, que administra esta app. Para conocer el mapa de los barrios organizados, el PTP usa **cantidades por barrio**, no datos de cada vecino.
>
> ### Tus derechos
> Darnos tus datos es voluntario, pero sin ellos no podés sumarte al comité. Podés pedir verlos, corregirlos o borrarlos cuando quieras, y salir del comité desde la app o escribiendo a **[e-mail de contacto]**.
>
> <small>Tenés derecho a acceder a tus datos en forma gratuita cada seis meses (art. 14, Ley 25.326). La Agencia de Acceso a la Información Pública, como órgano de control de la Ley 25.326, atiende las denuncias y reclamos por incumplimiento de las normas de protección de datos personales.</small>
>
> Al tocar "Estoy de acuerdo" confirmás que **tenés 18 años o más** y que leíste esta información.
>
> **[ Estoy de acuerdo ]**  [ Ahora no ]

### Idea 2: Reportes colaborativos de zonas inundadas

**Objetivo:** que la app deje de ser solo informativa. Los vecinos reportan en el mapa las calles, avenidas o zonas que están inundadas ahora, y todos pueden consultarlo. Hoy ya hay localidades enteras anegadas por la crecida del Paraná, como Isla del Cerrito (Chaco).

**Qué se reporta**
- Dos categorías:
  1. **Zona anegada**: hay agua, pero se puede pasar con cuidado.
  2. **Zona intransitable**: no se puede pasar.
- Qué se marca: un punto, una calle o avenida (un tramo), o una zona entera (un polígono).
- En lo posible, con fotos como prueba.
- **Solo pueden reportar los usuarios registrados** (decidido el 27/10/2026).

**Causa de la inundación y duración** (decidido el 27/10/2026)
- Al reportar, el vecino indica la causa. Cada causa tiene su duración:

| Causa | Cómo es | Duración del reporte |
|---|---|---|
| Precipitaciones | Rápida: el agua sube y baja en horas | 12 horas |
| Crecida del río | Lenta: el agua sube y se queda días o semanas | 4 días |

- Pasado ese plazo sin actualizaciones, el reporte deja de mostrarse en el mapa.
- Al vencer, el reporte no se borra de la base: queda como historial (ver "Valor a futuro").

**Actualización del estado** (decidido el 27/10/2026)
- Los vecinos actualizan el estado de un reporte existente eligiendo entre tres opciones:
  1. **Sin agua**
  2. **Anegada**
  3. **Intransitable**
- Cada actualización es una nueva observación con autor y hora. El mapa muestra el **estado más reciente**.
- Propuesta (a confirmar):
  - Cualquier actualización a "Anegada" o "Intransitable" renueva el plazo completo según la causa (12 h o 4 días).
  - "Sin agua" no oculta el reporte de inmediato: queda unas horas en verde ("ya se puede pasar") y después se oculta.
  - El reporte muestra su historial, ej. "Intransitable hace 5 h → Anegada hace 1 h". Si alguien marca "Sin agua" de mala fe, los demás lo ven y lo corrigen con una nueva actualización.

**Mapa**
- Los reportes vigentes se ven en el mapa general, como una capa más, encima de las zonas de riesgo oficiales.
- Cada reporte muestra la categoría, hace cuánto se cargó (ej. "hace 3 h"), cuántos vecinos lo confirmaron y las fotos.
- Tiene que funcionar en cualquier lugar del Chaco, no solo donde hay mapas de riesgo (Isla del Cerrito no está en el AMGR ni en Colonia Benítez).

**Cómo se marca desde el celular** (dibujar polígonos con el dedo es difícil)
- **Punto:** tocar el mapa o usar "estoy acá" con el GPS. Es lo más simple y lo primero que conviene hacer.
- **Tramo de calle:** tocar dos puntos y que la app siga la calle entre ellos, usando las calles de OpenStreetMap.
- **Zona:** tocar varios puntos para formar el contorno, o elegir un punto con un radio (ej. "toda esta manzana", "unos 200 m a la redonda").

**Fotos**
- Achicar las fotos en el celular antes de subirlas (ahorra datos móviles y espacio en el servidor).
- Borrar los datos internos de la foto (EXIF), que pueden traer la ubicación exacta y el modelo del teléfono. Antes de borrarla, la ubicación de la foto puede servir para comprobar que se sacó cerca del lugar reportado.
- Moderar fotos inapropiadas o con personas reconocibles (sobre todo menores).

**Confianza y moderación**
- Riesgo: reportes falsos o malintencionados.
- El registro obligatorio (se conecta con la Idea 1) ya frena buena parte del abuso: cada reporte tiene un autor identificable.
- Otras opciones: dar más peso a los reportes de delegados o a los confirmados por varios vecinos, botón "Reportar como falso", y que el equipo pueda borrar reportes.
- Mostrar claramente que es información de vecinos, no oficial.

**Valor a futuro**
- El historial de reportes arma un mapa de dónde se inunda de verdad y con qué frecuencia. Es un dato propio, construido por los vecinos, para reclamarle obras al Estado o para contrastar con los mapas oficiales de riesgo.

**Puntos a definir más adelante**
- Cuántas horas queda visible en verde un reporte marcado "Sin agua".
- ¿Quién modera: el equipo del PTP, los delegados de cada barrio, o los dos?
- Dónde se guardan las fotos y cuánto espacio hay en el VPS.

### Idea 3: Elección de delegados barriales

**Objetivo:** que cada barrio (o localidad) elija a sus delegados dentro de la app, con un mecanismo simple. Se conecta con la Idea 1 (comités de emergencia).

**Cómo funciona** (decidido el 27/10/2026)
1. **Postulación:** cualquier vecino registrado del barrio puede postularse como delegado.
2. **Seguimiento:** cada vecino del barrio elige a **un solo** delegado para seguir.
3. Cada barrio tiene **N delegados**: uno o más.
4. Un postulante cuenta como delegado desde que se postula, **aunque no tenga seguidores**.
5. Un vecino puede **cambiar de delegado cuando quiera**, o **no seguir a ninguno** si ninguno lo convence.

**Qué se ve**
- Los vecinos del barrio ven quiénes son sus delegados.
- Se publica el **número de WhatsApp de cada delegado** para los vecinos de su barrio.
- Se publica **cuántos seguidores tiene cada delegado**.
- **A quién sigue cada vecino no se muestra en ninguna pantalla de la app**, ni a vecinos, ni a delegados, ni en los paneles del PTP: solo se publica el total de cada delegado.
- En los paneles, el PTP solo ve los datos de cada delegado y cuántos seguidores tiene.
- No hay mensajes privados dentro de la app: el contacto con el delegado es por WhatsApp, fuera de la app.
- El texto de la pantalla inicial (Idea 1) ya avisa que, si alguien se postula, su nombre y su WhatsApp se publican para su barrio.

**Renuncia**
- Un delegado puede renunciar cuando quiera.
- Al renunciar, desaparece del panel de delegados y **sus datos dejan de ser públicos**.
- Sus seguidores quedan **sin delegado elegido** y pueden elegir entre los que queden.

**Cómo se guarda el seguimiento** (decidido el 27/10/2026)
- La base de datos guarda a quién sigue cada vecino, en forma directa.
- No hay acceso a ese dato desde la interfaz de la app: ninguna pantalla ni panel lo muestra.
- El administrador de la base de datos sí puede verlo.
- Por eso, el texto de la pantalla inicial dice que **ningún vecino ni delegado** puede ver a quién seguís, y no promete que el PTP no pueda saberlo.

**Puntos a definir más adelante**
- Un delegado que se muda o deja de participar: ¿deja de serlo automáticamente después de un tiempo sin actividad?
- ¿Pueden postularse vecinos que viven en un barrio pero participan en otro?

### Idea 4: Plan familiar de emergencia, paso a paso

**Objetivo:** convertir la guía de preparación y la mochila de emergencia (pestaña Información) en una lista para completar, para que cada familia se prepare antes de que llegue el agua.

**Cómo funciona**
- Una lista de tareas para tildar, por ejemplo:
  - Punto de encuentro de la familia acordado.
  - Teléfonos importantes anotados (familiares, delegado del barrio, emergencias).
  - Documentos guardados en bolsa impermeable.
  - Mochila de emergencia armada.
  - Qué hacer con las mascotas.
  - A dónde ir si hay que evacuar.
- El vecino ve su avance: "tu familia está 70 % preparada".

**Datos**
- Se guarda solo en el celular del vecino (almacenamiento del navegador). No se mandan datos personales al servidor y no hace falta registrarse.
- Es la más fácil de implementar de las ideas de esta lista.

**Puntos a definir más adelante**
- Lista definitiva de tareas, tomada de la guía "Antes de que llegue el agua" que ya usa la pestaña Información.
- ¿Se puede compartir o imprimir el plan (ej. para pegarlo en la heladera)?

### Idea 5: Avisos cuando el riesgo sube

**Objetivo:** que el vecino no tenga que entrar a la app para enterarse. Los datos que la app ya consulta (altura del Paraná y pronóstico de lluvias) se convierten en avisos en el momento justo.

**Cómo funciona**
- El vecino elige qué avisos quiere recibir, por ejemplo:
  - "Avisame si el Paraná supera la altura de alerta / de evacuación" (Prefectura, puerto Barranqueras).
  - "Avisame si se pronostican más de 50 mm de lluvia" (SMN y Open-Meteo).
- Canales posibles:
  - Notificaciones en el celular (notificaciones web, sin instalar nada).
  - Un **canal de WhatsApp** del PTP, que llega también a quienes no usan la app.
- Se conecta con la Idea 3: el aviso les llega primero a los delegados, para que movilicen el barrio.

**Puntos a definir más adelante**
- Qué umbrales usar y cómo evitar avisos repetidos (ej. un solo aviso por cruce de umbral).
- Los avisos no reemplazan las alertas oficiales (SMN, Defensa Civil): decirlo en cada aviso.

### Idea 6: Ayuda mutua: "Ofrezco / Necesito" por barrio

**Objetivo:** que los vecinos se ayuden entre ellos sin depender del Estado. Hoy esa información está dispersa en grupos de WhatsApp.

**Cómo funciona**
- Un tablero por barrio donde los vecinos registrados publican:
  - **Ofrezco:** "tengo canoa", "tengo bomba de agua", "tengo camioneta", "puedo alojar una familia".
  - **Necesito:** "ayuda para subir los muebles", "leña", "lugar para mis animales".
- Se conecta con la Idea 1 (registro y barrio) y con la Idea 3 (los delegados pueden coordinar).

**Puntos a definir más adelante**
- Cómo se contactan las personas, ya que no hay mensajes privados en la app (Idea 1): ¿a través del delegado, o se publica el WhatsApp solo de quien lo autoriza en esa publicación?
  - Posible solución (27/10/2026): quien publica que **necesita ayuda** puede permitir el contacto directo por WhatsApp o por llamada. Sería una excepción a la regla de datos ocultos, elegida por la propia persona en esa publicación.
- Cuánto dura una publicación y cómo se marca como resuelta.

### Idea 7: Vecinos que van a necesitar ayuda para evacuar

**Objetivo:** que cuando sube el agua, el delegado sepa a quién ir a buscar primero. En cada inundación, los que más sufren son los que no pueden salir solos.

**Cómo funciona**
- Cada familia indica, **de forma voluntaria**, si tiene:
  - Adultos mayores.
  - Personas con movilidad reducida o discapacidad.
  - Bebés o niños pequeños.
  - Personas que dependen de electricidad (ej. oxígeno).
  - No tiene vehículo.
- Lo ven **solo los delegados de su barrio**.

**Cuidados**
- Son datos de salud: la Ley 25.326 los considera **datos sensibles**. Necesitan consentimiento específico (una casilla aparte, explicando para qué se usan) y el acceso más restringido de toda la app.
- El vecino puede borrarlos en cualquier momento.
- Es la idea más valiosa y la más delicada.

**Puntos a definir más adelante**
- ¿El PTP ve estos datos, o solo los delegados del barrio?
- ¿Se pide la ubicación de la casa? El domicilio se descartó en la Idea 1; sin él, el delegado tendría que contactar a la familia por WhatsApp.
  - Posible solución (27/10/2026): la familia que indica que va a necesitar ayuda puede permitir el contacto directo por WhatsApp o por llamada.

### Ideas descartadas
- **Simulador "si el río llega a X metros, ¿se inunda mi casa?"** con las capas de cotas del terreno (descartada el 27/10/2026): el mapa de cotas de la ciudad es muy inexacto y no es fuente oficial.

## Decisiones técnicas

### Base de datos: seguimos con SQLite (decidido el 27/10/2026)

**Por qué alcanza**
- La app corre en un solo VPS, con un solo proceso de Next levantado por PM2. Es el caso para el que SQLite está pensado.
- El volumen esperado (chat, reportes, delegados, incluso en un día de crisis) es chico para SQLite en modo WAL, que ya está activado.
- Las restricciones que hacen falta (ej. "un vecino sigue a un solo delegado") se resuelven con claves únicas.

**Lo que no depende del motor de base de datos**
- Las fotos de los reportes se guardan como archivos (en el VPS o en un almacenamiento aparte); la base guarda solo la ruta.
- El chat en tiempo real necesita WebSockets o *server-sent events* en el servidor web.
- "Reportes cerca de mí" se resuelve con índices por latitud y longitud.

**Pendientes, con SQLite o con cualquier motor**
1. **Backups automáticos diarios, guardados fuera del VPS.** Es lo más urgente: la base ya tiene datos de vecinos y va a tener muchos más. Script listo en `backup.sh` (sube a Google Drive con rclone); falta configurarlo en el VPS.
2. **Migraciones numeradas** para los cambios de estructura (hoy `src/lib/db.ts` crea tablas y agrega columnas a medida que hacen falta).
3. `node:sqlite` sigue marcado como experimental en Node 24. Si una actualización de Node trae problemas, pasar a `better-sqlite3` sin cambiar la base.

**Cuándo migrar**
- Si hace falta más de un servidor atendiendo la app al mismo tiempo, o consultas geográficas pesadas dentro de la base.
- En ese caso, **PostgreSQL con PostGIS** antes que MariaDB, por sus herramientas geográficas.
- Para que la migración sea acotada, mantener las consultas a la base agrupadas en `src/lib/`.

### Servidor de prueba (planificado el 27/10/2026)

Antes de publicar en producción, los cambios se prueban en un servidor de prueba en el mismo VPS, con un subdominio propio, al que accede un equipo interno.

**Recomendaciones para armarlo**
- **Base de datos separada** (variable `DATABASE_PATH`): prueba y producción nunca comparten la base.
- Proceso propio en PM2 (ej. `elnino2-test`, puerto 3002), en su propia carpeta y siguiendo su propia rama de git (ej. `test`).
- Subdominio con usuario y contraseña en nginx (solo el equipo interno) y sin indexar en buscadores.
- Cuando haya login con Google, registrar cada dominio por separado en la configuración de Google.
- Adaptar `deploy.sh` (hoy tiene el nombre de la app y el puerto fijos) para que sirva para los dos entornos.
