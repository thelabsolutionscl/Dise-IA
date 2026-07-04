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
     PUNTO DE INTEGRACIÓN: OPEN GENERATIVE AI
     Cuando el repo esté conectado, cambia available a true e
     implementa generate() llamando a su código o API.
     ------------------------------------------------------------ */
  openGenerativeAI: {
    id: 'openGenerativeAI',
    label: 'OPEN GENERATIVE AI · próximamente',
    available: false,
    note: 'Integración pendiente con tu repositorio de OPEN GENERATIVE AI.',
    async generate() {
      throw new Error('OPEN GENERATIVE AI aún no está integrado.');
    },
  },
};

function getAvailableProviders() {
  return Object.values(PROVIDERS);
}

function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.pollinations;
}
