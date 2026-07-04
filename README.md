# 🎨 Dise-IA · Dashboard de Diseño Flopilove

Dashboard personal de diseño con IA. Una sola página web, sin instalaciones ni
dependencias: se abre en el navegador y listo.

## Qué incluye

- **🖼 Galería** — sube tus diseños (arrastrar y soltar), etiquétalos, márcalos
  como favoritos, búscalos y descárgalos. Se guardan en tu navegador (IndexedDB).
- **⚡ Generar** — genera diseños con IA escribiendo un prompt, con estilos
  rápidos (minimalista, acuarela, 3D, logo…). Motores disponibles:
  - **Pollinations** — gratis, sin clave ni registro. Funciona de inmediato.
  - **OpenAI (gpt-image-1)** — opcional, con tu propia clave de API
    (se guarda solo en tu navegador).
  - **OPEN GENERATIVE AI (OpenGen Studio)** — integrado (ver abajo).
- **✏️ Prompts** — biblioteca de prompts reutilizables con etiquetas, copiar y
  "usar" directo en el generador.
- **📁 Proyectos** — tablero Pendiente / En proceso / Entregado con cliente,
  fecha límite y notas.
- **Ajustes** — modo claro/oscuro, exportar/importar respaldo completo (.json).

## Cómo usarlo

### Opción 1: abrir localmente
Descarga el repo y abre `index.html` en tu navegador. Ya está.

### Opción 2: publicarlo con GitHub Pages (recomendado)
1. En GitHub, ve a **Settings → Pages** de este repositorio.
2. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. Guarda. En un minuto tu dashboard estará en
   `https://<tu-usuario>.github.io/Dise-IA/`.

> 💡 Tus datos (diseños, prompts, proyectos) viven en el navegador donde uses
> el dashboard, no en GitHub. Usa **Ajustes → Exportar** para respaldarlos o
> moverlos a otro dispositivo.

## Integración con OPEN GENERATIVE AI

El motor **OPEN GENERATIVE AI · OpenGen Studio** está integrado en la pestaña
**Generar**. Replica el flujo del repositorio
[`Open-Generative-AI`](https://github.com/thelabsolutionscl/Open-Generative-AI):
llama a la API de [muapi.ai](https://muapi.ai) (POST al endpoint del modelo y
polling del resultado) a través del mismo proxy CORS que usa OpenGen Studio.

- **Clave**: se configura en **Ajustes → OPEN GENERATIVE AI** (la misma de
  muapi.ai que usas en el Studio; se guarda solo en tu navegador).
- **Modelos texto→imagen disponibles**: Flux Schnell, Flux Dev, Midjourney v7,
  Imagen 4, GPT-4o Image, Ideogram v3 y Seedream 4.5 (subconjunto curado del
  Studio, definido en `OGAI_MODELS` dentro de [`providers.js`](providers.js)).
- **Studio completo instalado**: la app OpenGen Studio vive en
  [`studio/`](studio/) dentro de este mismo sitio (video, audio, edición,
  upscale y más). Se abre desde el menú lateral (🎬 Studio) y comparte la
  clave de muapi.ai con el dashboard, guardándola en el navegador para no
  tener que pegarla en cada visita.

## Estructura

```
index.html     → estructura de la app (vistas, modales)
styles.css     → estilos y temas claro/oscuro
app.js         → lógica del dashboard
providers.js   → motores de generación de imágenes (integraciones IA)
db.js          → almacenamiento local (IndexedDB + localStorage)
```
