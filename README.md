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
  - **OPEN GENERATIVE AI** — punto de integración reservado (ver abajo).
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

## Integrar OPEN GENERATIVE AI

El generador está preparado para conectar un motor propio. La integración vive
en [`providers.js`](providers.js): hay una entrada `openGenerativeAI` lista para
implementar su función `generate()` llamando al código o API del repositorio
OPEN GENERATIVE AI. Al activarla (`available: true`) aparece automáticamente
como opción en la pestaña **Generar**.

## Estructura

```
index.html     → estructura de la app (vistas, modales)
styles.css     → estilos y temas claro/oscuro
app.js         → lógica del dashboard
providers.js   → motores de generación de imágenes (integraciones IA)
db.js          → almacenamiento local (IndexedDB + localStorage)
```
