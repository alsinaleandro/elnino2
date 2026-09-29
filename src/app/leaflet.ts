// Carga Leaflet desde unpkg una sola vez, aunque lo pidan varias pestañas a la vez.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L?: any;
  }
}

const LEAFLET_VERSION = "1.9.4";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loading: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadLeaflet(): Promise<any> {
  if (window.L) {
    return Promise.resolve(window.L);
  }

  loading ??= new Promise((resolve, reject) => {
    if (!document.querySelector("link[data-leaflet-css]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
      link.setAttribute("data-leaflet-css", "true");
      document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => {
      loading = null;
      reject(new Error("No se pudo cargar la librería de mapas."));
    };
    document.body.appendChild(script);
  });

  return loading;
}

// Elimina un mapa aunque tenga un zoom animado en curso. Si no, al terminar la transición
// Leaflet intenta mover un mapa que ya no existe ("reading '_leaflet_pos'"). Con
// _animatingZoom en false, _onZoomTransitionEnd sale sin hacer nada.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function removeMap(map: any) {
  map.stop();
  map._animatingZoom = false;
  map.remove();
}
