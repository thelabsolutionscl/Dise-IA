/* ============================================================
   db.js — Almacenamiento local del dashboard.
   - IndexedDB para las imágenes de la galería (blobs pesados).
   - localStorage para prompts, proyectos y ajustes (JSON ligero).
   ============================================================ */

const DB_NAME = 'flopilove-dashboard';
const DB_VERSION = 1;
const STORE_DESIGNS = 'designs';

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DESIGNS)) {
        db.createObjectStore(STORE_DESIGNS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function idbPutDesign(design) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DESIGNS, 'readwrite');
    tx.objectStore(STORE_DESIGNS).put(design);
    tx.oncomplete = () => resolve(design);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAllDesigns() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DESIGNS, 'readonly');
    const req = tx.objectStore(STORE_DESIGNS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbDeleteDesign(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DESIGNS, 'readwrite');
    tx.objectStore(STORE_DESIGNS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearDesigns() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DESIGNS, 'readwrite');
    tx.objectStore(STORE_DESIGNS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ===== localStorage (prompts, proyectos, ajustes) ===== */

const LS_PREFIX = 'flopilove:';

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible (modo privado / iframe restringido) */
  }
}

function lsRemoveAll() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LS_PREFIX)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

/* ===== Procesamiento de imágenes (compresión + miniaturas) ===== */

const IMG_MAX_FULL = 2048;   // lado máximo del diseño guardado
const IMG_MAX_THUMB = 480;   // lado máximo de la miniatura de galería

function scaleToBlob(bitmap, maxSize, quality) {
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

/**
 * Comprime una imagen a WebP y genera su miniatura.
 * Devuelve { full, thumb } o null si el navegador no puede decodificarla
 * (p. ej. fotos HEIC de iPhone).
 * Los GIF conservan el original como `full` para no perder la animación.
 */
async function processImage(blob) {
  // SVG: es vectorial y liviano, se guarda tal cual (createImageBitmap no lo decodifica)
  if (blob.type === 'image/svg+xml') return { full: blob, thumb: null };
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  try {
    const thumb = await scaleToBlob(bitmap, IMG_MAX_THUMB, 0.8);
    let full = blob;
    if (blob.type !== 'image/gif') {
      const compressed = await scaleToBlob(bitmap, IMG_MAX_FULL, 0.85);
      // Solo se reemplaza el original si la compresión realmente ahorra espacio
      if (compressed && compressed.size < blob.size) full = compressed;
    }
    return { full, thumb: thumb || null };
  } finally {
    bitmap.close();
  }
}

/* ===== Utilidades blob <-> dataURL (para exportar/importar) ===== */

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataURLToBlob(dataURL) {
  const res = await fetch(dataURL);
  return res.blob();
}
