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
  localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
}

function lsRemoveAll() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LS_PREFIX)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
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
