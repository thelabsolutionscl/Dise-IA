/* ============================================================
   providers.js — Motores de generación de imágenes.

   Cada provider implementa:
     generate({ prompt, size }) -> Promise<Blob>
   donde size es 'square' | 'landscape' | 'portrait'.

   Para añadir un motor nuevo (p. ej. el repo OPEN GENERATIVE AI),
   agrega una entrada a PROVIDERS con available: true y su generate().
   ============================================================ */

const SIZE_MAP = {
  pollinations: { square: [1024, 1024], landscape: [1280, 800], portrait: [800, 1280] },
  openai:       { square: '1024x1024', landscape: '1536x1024', portrait: '1024x1536' },
  dalle3:       { square: '1024x1024', landscape: '1792x1024', portrait: '1024x1792' },
};

const PROVIDERS = {

  pollinations: {
    id: 'pollinations',
    label: 'Pollinations · gratis, sin clave',
    available: true,
    note: 'Motor gratuito y abierto. No necesita configuración: escribe tu prompt y genera.',
    async generate({ prompt, size }) {
      const [w, h] = SIZE_MAP.pollinations[size] || SIZE_MAP.pollinations.square;
      const seed = Math.floor(Math.random() * 1e9);
      const url =
        'https://image.pollinations.ai/prompt/' +
        encodeURIComponent(prompt) +
        `?width=${w}&height=${h}&seed=${seed}&nologo=true`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Pollinations respondió ${res.status}. Intenta de nuevo en unos segundos.`);
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Pollinations no devolvió una imagen. Intenta de nuevo.');
      return blob;
    },
  },

  openai: {
    id: 'openai',
    label: 'OpenAI · gpt-image-1 (requiere clave)',
    available: true,
    needsKey: true,
    note: 'Usa tu propia clave de OpenAI (se guarda solo en este navegador). Configúrala en Ajustes.',
    async generate({ prompt, size }) {
      const key = lsGet('openaiKey', '');
      if (!key) throw new Error('Falta tu clave de OpenAI. Agrégala en Ajustes → Motores de IA.');
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt,
          n: 1,
          size: SIZE_MAP.openai[size] || SIZE_MAP.openai.square,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error?.message || `OpenAI respondió ${res.status}`;
        throw new Error(msg);
      }
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error('OpenAI no devolvió imagen.');
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: 'image/png' });
    },
  },

  /* ------------------------------------------------------------
     OPEN GENERATIVE AI (OpenGen Studio)
     Integración con el repo thelabsolutionscl/Open-Generative-AI:
     usa la API de muapi.ai con el mismo flujo que OpenGen Studio
     (POST al endpoint del modelo → polling del resultado), a través
     del mismo proxy CORS que usa el Studio en GitHub Pages.
     ------------------------------------------------------------ */
  openGenerativeAI: {
    id: 'openGenerativeAI',
    label: 'OPEN GENERATIVE AI · OpenGen Studio',
    available: true,
    needsKey: true,
    hasModels: true,
    note: 'Tu motor propio: Flux, Midjourney, Imagen 4 y más vía muapi.ai. Configura tu clave en Ajustes → OPEN GENERATIVE AI.',
    async generate({ prompt, size, model }) {
      const key = lsGet('muapiKey', '');
      if (!key) throw new Error('Falta tu clave de muapi.ai. Agrégala en Ajustes → OPEN GENERATIVE AI.');

      const ep = model || OGAI_MODELS[0].ep;
      const ratio = { square: '1:1', landscape: '16:9', portrait: '9:16' }[size] || '1:1';

      const res = await fetch(corsProxy(`https://api.muapi.ai/api/v1/${ep}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ prompt, aspect_ratio: ratio }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`OpenGen respondió ${res.status}: ${t.slice(0, 120)}`);
      }
      const data = await res.json();
      const reqId = data.request_id || data.id;
      if (!reqId) throw new Error('OpenGen no devolvió request_id.');

      // Polling hasta que el modelo termine (máx ~2.5 min)
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const poll = await fetch(
          corsProxy(`https://api.muapi.ai/api/v1/predictions/${reqId}/result`),
          { headers: { 'x-api-key': key } }
        );
        const pd = await poll.json();
        if (pd.status === 'completed' || pd.status === 'succeeded') {
          const url = pd.url || pd.outputs?.[0] || pd.output?.[0];
          if (!url) throw new Error('OpenGen no devolvió la URL del resultado.');
          return fetchImageBlob(url);
        }
        if (pd.status === 'failed' || pd.status === 'error') {
          throw new Error(pd.error || 'La generación falló en el servidor de OpenGen.');
        }
      }
      throw new Error('Tiempo de espera agotado (2.5 min). Intenta con un modelo más rápido.');
    },
  },
};

/* Modelos texto→imagen de OpenGen Studio (subconjunto curado del repo) */
const OGAI_MODELS = [
  { ep: 'flux-schnell-image', name: 'Flux Schnell · ultra-rápido' },
  { ep: 'flux-dev-image', name: 'Flux Dev · alta calidad' },
  { ep: 'midjourney-v7-text-to-image', name: 'Midjourney v7 · artístico' },
  { ep: 'google-imagen4', name: 'Imagen 4 · Google' },
  { ep: 'gpt4o-text-to-image', name: 'GPT-4o Image · OpenAI' },
  { ep: 'ideogram-v3', name: 'Ideogram v3 · ideal con texto' },
  { ep: 'bytedance-seedream-v4.5', name: 'Seedream 4.5 · premium' },
];

function corsProxy(url) {
  return 'https://corsproxy.io/?url=' + encodeURIComponent(url);
}

/* Descarga el resultado como Blob; si el CDN no permite CORS, reintenta vía proxy */
async function fetchImageBlob(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return await res.blob();
  } catch {
    const res = await fetch(corsProxy(url));
    if (!res.ok) throw new Error('No se pudo descargar el resultado.');
    return res.blob();
  }
}

function getAvailableProviders() {
  return Object.values(PROVIDERS);
}

function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.pollinations;
}
