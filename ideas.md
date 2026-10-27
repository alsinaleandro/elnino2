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

**Puntos a definir más adelante**
- Diferencia entre dónde está el vecino ahora y dónde vive: si se registra desde el trabajo, el GPS daría otro barrio. Conviene que la app proponga el barrio detectado y el usuario lo confirme o lo corrija.
- Privacidad: cumplir la Ley 25.326 de Protección de Datos Personales (consentimiento explícito, finalidad informada, posibilidad de borrar los datos). Definir quién ve el WhatsApp y el email de cada vecino.
- Moderación del chat: qué pasa con mensajes ofensivos o falsos y quién modera cada barrio (¿un coordinador del comité?).
- Barrios ingresados a mano: evitar duplicados con nombres escritos de forma distinta (ej. "Villa Prosperidad" / "V. Prosperidad").
