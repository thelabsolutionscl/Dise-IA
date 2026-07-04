---
name: verify
description: Cómo construir, lanzar y verificar el dashboard Flopilove (app estática) de este repo.
---

# Verificar el dashboard Flopilove

App 100% estática (HTML/CSS/JS, sin build). Superficie: navegador.

## Lanzar

```bash
python3 -m http.server 8123 &   # desde la raíz del repo
```

## Manejar (Playwright)

- Chromium preinstalado: `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`
  (comprobar el sufijo de versión con `ls /opt/pw-browsers/`).
- `npm install playwright` en un directorio temporal (no en el repo — no hay package.json a propósito).

## Flujos que vale la pena manejar

1. Inicio: 4 stat tiles renderizan.
2. Prompts: crear en el modal → "⚡ Usar" debe rellenar `#gen-prompt` y cambiar a la vista Generar.
3. Generar: prompt vacío → toast de aviso; chips de estilo togglean clase `.active`.
4. Galería: subir vía `setInputFiles('#file-input', png)`; lightbox renombra/etiqueta; filtro por chip de etiqueta; búsqueda.
5. Proyectos: crear con fecha pasada → badge "atrasado"; botones ← → mueven entre columnas.
6. Persistencia: recargar página; tema y datos deben sobrevivir (localStorage + IndexedDB).
7. Export: `waitForEvent('download')` sobre `#btn-export`; el JSON incluye designs/prompts/projects.

## Gotchas

- La generación con **Pollinations falla en el sandbox** (`ERR_TUNNEL_CONNECTION_FAILED`, el proxy
  bloquea image.pollinations.ai). No es un bug de la app: verificar solo que el error se maneja con toast.
- Los chips tienen `transition: all 0.12s` — esperar ~300ms antes de leer `getComputedStyle`.
- Cada `chromium.launch()` es un perfil limpio: no hay estado entre corridas.
