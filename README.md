# 🎨 Dise-IA · Dashboard de Diseño Flopilove

Dashboard personal de diseño con IA para trabajo freelance. Una sola página web,
sin instalaciones ni dependencias — y también **app instalable (PWA)** que
funciona sin conexión.

**En vivo:** https://thelabsolutionscl.github.io/Dise-IA/

## Qué incluye

- **🖼 Galería** — sube tus diseños (arrastrar y soltar), etiquétalos, favoritos,
  búsqueda y descarga. Las imágenes se comprimen a WebP con miniaturas
  automáticas, y se guardan en tu navegador (IndexedDB, con almacenamiento
  persistente solicitado al navegador).
- **⚡ Generar** — diseños por prompt con estilos rápidos y tres motores:
  - **Pollinations** — gratis, sin clave ni registro.
  - **OpenAI (gpt-image-1)** — opcional, con tu propia clave.
  - **OPEN GENERATIVE AI (OpenGen Studio)** — tu motor propio vía muapi.ai,
    con Flux, Midjourney v7, Imagen 4, GPT-4o Image y más.
  - Con **kit de marca**: elige un cliente y su paleta/tipografías se inyectan
    al prompt.
- **🎬 Studio** — OpenGen Studio completo embebido como sección del dashboard
  (video, audio, edición, upscale), con clave compartida y pantalla completa.
- **✏️ Prompts** — biblioteca reutilizable: copiar, usar en el generador o
  enviar directo al Studio.
- **📁 Proyectos** — tablero Pendiente / En proceso / Entregado con cliente,
  fecha límite (aviso de atraso en tu zona horaria), **precio y estado de
  pago**, **paleta y tipografías del cliente**, y diseños vinculados.
  Exporta tus entregas a Google/Apple Calendar (**.ics**).
- **🎁 Presentaciones** — selecciona diseños de la galería y expórtalos como
  una página HTML elegante para enviar a tu cliente.
- **Inicio** — resumen con estadísticas, próximas entregas y últimos diseños.
- **☁️ Airtable (opcional)** — sincroniza proyectos, prompts y diseños (con
  imagen) a una base de Airtable tuya: respaldo en la nube, acceso desde
  cualquier dispositivo y botón "Restaurar" para bajar todo en otro equipo.
- **Ajustes** — tema claro/oscuro, claves de API, proxy propio, Airtable, y
  exportar/importar respaldo completo (con recordatorio si llevas 7+ días
  sin respaldar).

## Cómo usarlo

- **Online:** https://thelabsolutionscl.github.io/Dise-IA/ (se actualiza solo
  al fusionar a `main`).
- **Como app:** ábrelo en el navegador y usa "Instalar app" / "Añadir a
  pantalla de inicio". Funciona offline (salvo la generación con IA).
- **Local:** descarga el repo y abre `index.html`.

> 💡 Tus datos (diseños, prompts, proyectos, claves) viven en el navegador
> donde uses el dashboard, no en GitHub. Usa **Ajustes → Exportar** para
> respaldarlos o moverlos a otro dispositivo.

## Integración con OPEN GENERATIVE AI

El motor replica el flujo del repositorio
[`Open-Generative-AI`](https://github.com/thelabsolutionscl/Open-Generative-AI):
llama a la API de [muapi.ai](https://muapi.ai) (POST al endpoint del modelo y
polling del resultado) a través de un proxy CORS.

- **Clave**: en **Ajustes → OPEN GENERATIVE AI** (compartida con el Studio,
  guardada solo en tu navegador).
- **Modelos texto→imagen**: definidos en `OGAI_MODELS` dentro de
  [`providers.js`](providers.js).
- **Studio completo**: instalado en [`studio/`](studio/) y embebido como
  sección del dashboard.

## Sincronización con Airtable

La app habla directo con la API de Airtable desde tu navegador — el token
nunca sale de él. Para conectarla:

1. Usa una base preparada (existe **Flopilove Dashboard**, `appGuzyaPw7QJDVX1`,
   con las tablas ya creadas) o crea una base vacía en tu cuenta.
2. Genera un token en [airtable.com/create/tokens](https://airtable.com/create/tokens)
   con permisos `data.records:read` y `data.records:write` para esa base
   (si la base está vacía, agrega también `schema.bases:read` y
   `schema.bases:write` para que la app cree las tablas sola).
3. En **Ajustes → Airtable** pega el token (`pat…`) y el ID de la base
   (`app…`, está en la URL de la base) → **Guardar** → **Sincronizar ahora**.

Desde ahí, cada cambio se sube solo, lo borrado local se
borra en la nube, y en otro dispositivo basta pegar el mismo token y usar
**Restaurar desde Airtable**. La lógica vive en [`airtable.js`](airtable.js).

## Proxy propio (privacidad)

Por defecto las llamadas a muapi.ai pasan por un proxy CORS público que puede
ver tu clave. Para privacidad total, despliega tu propio proxy gratuito:

1. Entra a [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages
   → Create Worker.
2. Pega el contenido de [`proxy/worker.js`](proxy/worker.js) y dale Deploy.
3. En el dashboard: **Ajustes → Proxy propio** → pega
   `https://tu-worker.workers.dev/?url=`

El worker solo permite los hosts que usa el dashboard (allowlist), así nadie
más puede aprovecharlo.

## Estructura

```
index.html            → estructura de la app (vistas, modales)
styles.css            → estilos y temas claro/oscuro
app.js                → lógica del dashboard
providers.js          → motores de generación (integraciones IA)
db.js                 → almacenamiento local + compresión de imágenes
sw.js                 → service worker (PWA / offline)
manifest.webmanifest  → manifiesto de la app instalable
studio/index.html     → OpenGen Studio instalado (clave y proxy compartidos)
proxy/worker.js       → proxy CORS propio (Cloudflare Worker, opcional)
```
