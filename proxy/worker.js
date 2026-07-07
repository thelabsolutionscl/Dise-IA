/* ============================================================
   Proxy CORS propio para el dashboard Flopilove / OpenGen Studio.

   ¿Para qué? Las llamadas a muapi.ai necesitan un proxy CORS.
   El público (corsproxy.io) funciona, pero es un tercero que ve
   tu clave y tus prompts. Con este worker, todo pasa solo por
   tu propia cuenta gratuita de Cloudflare.

   Despliegue (gratis, ~2 minutos):
   1. Entra a https://dash.cloudflare.com (crea cuenta si no tienes)
   2. Workers & Pages → Create → Worker → dale un nombre (ej. flopi-proxy)
   3. Edit code → borra el ejemplo → pega este archivo completo → Deploy
   4. Copia la URL del worker y pégala en el dashboard:
      Ajustes → Proxy propio → https://flopi-proxy.TUCUENTA.workers.dev/?url=
      (importante: debe terminar en ?url=)

   Solo permite los hosts que usa el dashboard (allowlist), así
   nadie puede usar tu worker como proxy genérico.
   ============================================================ */

const ALLOWED_HOSTS = ['api.muapi.ai', 'image.pollinations.ai'];
// Adjuntos de Airtable (para "Restaurar desde Airtable" cuando su CDN no permite CORS)
const ALLOWED_SUFFIXES = ['.airtableusercontent.com'];

export default {
  async fetch(request) {
    const target = new URL(request.url).searchParams.get('url');
    if (!target) return new Response('Falta el parámetro ?url=', { status: 400 });

    let dest;
    try {
      dest = new URL(target);
    } catch {
      return new Response('URL inválida', { status: 400 });
    }
    const hostOk =
      ALLOWED_HOSTS.includes(dest.hostname) ||
      ALLOWED_SUFFIXES.some((s) => dest.hostname.endsWith(s));
    if (dest.protocol !== 'https:' || !hostOk) {
      return new Response('Host no permitido', { status: 403 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // Solo se reenvían las cabeceras necesarias
    const headers = new Headers();
    for (const h of ['content-type', 'x-api-key', 'authorization']) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }

    const res = await fetch(dest, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    });

    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(corsHeaders())) out.headers.set(k, v);
    return out;
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}
