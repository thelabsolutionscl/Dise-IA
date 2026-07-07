/* ============================================================
   airtable.js — Sincronización opcional con Airtable.

   La app habla directo con la API de Airtable desde el navegador
   usando un token personal (guardado solo en localStorage). En la
   primera sincronización crea las tablas Proyectos / Prompts /
   Diseños dentro de la base vacía que indique el usuario.

   El mapeo id local ↔ record de Airtable vive en localStorage
   (flopilove:atMap); LocalId en cada tabla permite reconstruirlo.
   ============================================================ */

const AT_API = 'https://api.airtable.com/v0';
const AT_CONTENT = 'https://content.airtable.com/v0';

const AT_STATUS_LABEL = { pendiente: 'Pendiente', proceso: 'En proceso', entregado: 'Entregado' };
const AT_PAY_LABEL = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado' };
const AT_STATUS_KEY = { Pendiente: 'pendiente', 'En proceso': 'proceso', Entregado: 'entregado' };
const AT_PAY_KEY = { Pendiente: 'pendiente', Parcial: 'parcial', Pagado: 'pagado' };

/* ===== Configuración y estado ===== */

function atConfig() {
  return { token: lsGet('atToken', ''), base: lsGet('atBase', '') };
}

function atReady() {
  const c = atConfig();
  return Boolean(c.token && c.base);
}

function atMap() {
  return lsGet('atMap', { projects: {}, prompts: {}, designs: {} });
}

function atSaveMap(map) {
  lsSet('atMap', map);
}

function atStatus(msg) {
  const el = document.getElementById('at-status');
  if (el) el.textContent = msg;
}

/* Cola secuencial: respeta el límite de 5 peticiones/segundo de Airtable */
let _atChain = Promise.resolve();
function atQueue(fn) {
  _atChain = _atChain
    .then(fn)
    .then(() => new Promise((r) => setTimeout(r, 250)))
    .catch((e) => {
      console.warn('Airtable:', e);
      atStatus('⚠️ ' + (e.message || 'Error de sincronización'));
    });
  return _atChain;
}

async function atFetch(url, opts = {}) {
  const { token } = atConfig();
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.error === 'string' ? data.error : data?.error?.message || data?.error?.type;
    throw new Error(detail || `Airtable respondió ${res.status}`);
  }
  return data;
}

/* ===== Creación de tablas (primera sincronización) ===== */

const AT_SCHEMAS = {
  Proyectos: [
    { name: 'Nombre', type: 'singleLineText' },
    { name: 'Cliente', type: 'singleLineText' },
    { name: 'Estado', type: 'singleSelect', options: { choices: [{ name: 'Pendiente' }, { name: 'En proceso' }, { name: 'Entregado' }] } },
    { name: 'Fecha límite', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Precio', type: 'singleLineText' },
    { name: 'Pago', type: 'singleSelect', options: { choices: [{ name: 'Pendiente' }, { name: 'Parcial' }, { name: 'Pagado' }] } },
    { name: 'Paleta', type: 'singleLineText' },
    { name: 'Tipografías', type: 'singleLineText' },
    { name: 'Notas', type: 'multilineText' },
    { name: 'LocalId', type: 'singleLineText' },
  ],
  Prompts: [
    { name: 'Título', type: 'singleLineText' },
    { name: 'Texto', type: 'multilineText' },
    { name: 'Etiquetas', type: 'singleLineText' },
    { name: 'LocalId', type: 'singleLineText' },
  ],
  // Diseños se arma en atSetup porque el campo Proyecto necesita el id de la tabla Proyectos
};

async function atSetup() {
  const { base } = atConfig();
  const schema = await atFetch(`${AT_API}/meta/bases/${base}/tables`);
  const have = Object.fromEntries((schema.tables || []).map((t) => [t.name, t.id]));

  for (const name of ['Proyectos', 'Prompts']) {
    if (!have[name]) {
      const t = await atFetch(`${AT_API}/meta/bases/${base}/tables`, {
        method: 'POST',
        body: JSON.stringify({ name, fields: AT_SCHEMAS[name] }),
      });
      have[name] = t.id;
    }
  }

  if (!have['Diseños']) {
    const t = await atFetch(`${AT_API}/meta/bases/${base}/tables`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Diseños',
        fields: [
          { name: 'Nombre', type: 'singleLineText' },
          { name: 'Imagen', type: 'multipleAttachments' },
          { name: 'Etiquetas', type: 'singleLineText' },
          { name: 'Prompt', type: 'multilineText' },
          { name: 'Motor', type: 'singleLineText' },
          { name: 'Proyecto', type: 'multipleRecordLinks', options: { linkedTableId: have['Proyectos'] } },
          { name: 'Favorito', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
          { name: 'Fecha', type: 'date', options: { dateFormat: { name: 'iso' } } },
          { name: 'LocalId', type: 'singleLineText' },
        ],
      }),
    });
    have['Diseños'] = t.id;
  }
  lsSet('atSetupDone', true);
  return have;
}

async function atEnsureSetup() {
  if (!lsGet('atSetupDone', false)) await atSetup();
}

/* ===== Campos local → Airtable ===== */

function atProjectFields(p) {
  return {
    Nombre: p.name || '',
    Cliente: p.client || '',
    Estado: AT_STATUS_LABEL[p.status] || 'Pendiente',
    'Fecha límite': p.dueDate || null,
    Precio: p.price || '',
    Pago: AT_PAY_LABEL[p.payment] || null,
    Paleta: p.palette || '',
    'Tipografías': p.fonts || '',
    Notas: p.notes || '',
    LocalId: p.id,
  };
}

function atPromptFields(p) {
  return { 'Título': p.title || '', Texto: p.text || '', Etiquetas: (p.tags || []).join(', '), LocalId: p.id };
}

function atDesignFields(d) {
  const map = atMap();
  const projectRec = d.projectId ? map.projects[d.projectId] : null;
  return {
    Nombre: d.name || '',
    Etiquetas: (d.tags || []).join(', '),
    Prompt: d.prompt || '',
    Motor: d.provider || '',
    Proyecto: projectRec ? [projectRec] : [],
    Favorito: Boolean(d.favorite),
    Fecha: new Date(d.createdAt).toISOString().slice(0, 10),
    LocalId: d.id,
  };
}

/* ===== Subir / actualizar / borrar ===== */

async function atUpsertBatch(table, items, fieldsFn, mapKey, { sweep = true } = {}) {
  // sweep=false cuando items es un subconjunto (p. ej. un solo diseño):
  // el barrido de borrados solo es válido con la lista local completa
  const { base } = atConfig();
  const url = `${AT_API}/${base}/${encodeURIComponent(table)}`;
  const map = atMap();
  const created = [];

  const toCreate = items.filter((x) => !map[mapKey][x.id]);
  for (let i = 0; i < toCreate.length; i += 10) {
    const chunk = toCreate.slice(i, i + 10);
    const data = await atFetch(url, {
      method: 'POST',
      body: JSON.stringify({ records: chunk.map((x) => ({ fields: fieldsFn(x) })), typecast: true }),
    });
    (data.records || []).forEach((r, j) => {
      map[mapKey][chunk[j].id] = r.id;
      created.push({ localId: chunk[j].id, recordId: r.id });
    });
    atSaveMap(map);
  }

  const toUpdate = items.filter((x) => map[mapKey][x.id] && !created.some((c) => c.localId === x.id));
  for (let i = 0; i < toUpdate.length; i += 10) {
    const chunk = toUpdate.slice(i, i + 10);
    await atFetch(url, {
      method: 'PATCH',
      body: JSON.stringify({ records: chunk.map((x) => ({ id: map[mapKey][x.id], fields: fieldsFn(x) })), typecast: true }),
    });
  }

  // Lo borrado localmente se borra también en Airtable
  if (!sweep) return created;
  const liveIds = new Set(items.map((x) => x.id));
  const gone = Object.keys(map[mapKey]).filter((lid) => !liveIds.has(lid));
  for (let i = 0; i < gone.length; i += 10) {
    const chunk = gone.slice(i, i + 10);
    const qs = chunk.map((lid) => 'records[]=' + map[mapKey][lid]).join('&');
    await atFetch(`${url}?${qs}`, { method: 'DELETE' }).catch(() => {});
    chunk.forEach((lid) => delete map[mapKey][lid]);
    atSaveMap(map);
  }

  return created;
}

async function atUploadImage(recordId, d) {
  if (!d.blob || d.blob.size > 4.9 * 1024 * 1024) throw new Error('imagen demasiado grande para Airtable (5MB)');
  const dataUrl = await blobToDataURL(d.blob);
  const EXT = { 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/jpeg': '.jpg', 'image/png': '.png' };
  await atFetch(`${AT_CONTENT}/${atConfig().base}/${recordId}/Imagen/uploadAttachment`, {
    method: 'POST',
    body: JSON.stringify({
      contentType: d.blob.type || 'image/png',
      file: dataUrl.split(',')[1],
      filename: (d.name || 'diseno') + (EXT[d.blob.type] || '.png'),
    }),
  });
}

/* ===== Sincronización completa (botón "Sincronizar ahora") ===== */

async function atPushAll() {
  if (!atReady()) throw new Error('Configura tu token y el ID de la base primero.');
  atStatus('Sincronizando…');
  await atEnsureSetup();

  await atUpsertBatch('Proyectos', state.projects, atProjectFields, 'projects');
  await atUpsertBatch('Prompts', state.prompts, atPromptFields, 'prompts');
  const newDesigns = await atUpsertBatch('Diseños', state.designs, atDesignFields, 'designs');

  let imgFail = 0;
  for (const { localId, recordId } of newDesigns) {
    const d = state.designs.find((x) => x.id === localId);
    if (!d) continue;
    try {
      await atUploadImage(recordId, d);
    } catch (e) {
      console.warn('Airtable imagen:', e);
      imgFail++;
    }
  }

  lsSet('atLastSync', Date.now());
  atStatus(
    `✅ Sincronizado a las ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` +
      (imgFail ? ` · ⚠️ ${imgFail} imagen(es) no subieron` : '')
  );
}

/* ===== Restaurar desde Airtable (botón "Restaurar") ===== */

async function atListAll(table) {
  const { base } = atConfig();
  const records = [];
  let offset;
  do {
    const data = await atFetch(
      `${AT_API}/${base}/${encodeURIComponent(table)}?pageSize=100` + (offset ? `&offset=${offset}` : '')
    );
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

async function atFetchAttachment(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return await res.blob();
  } catch {
    // El CDN de adjuntos puede no permitir CORS: se reintenta vía proxy
    const res = await fetch(corsProxy(url));
    if (!res.ok) throw new Error('No se pudo descargar la imagen.');
    return res.blob();
  }
}

async function atPullAll() {
  if (!atReady()) throw new Error('Configura tu token y el ID de la base primero.');
  atStatus('Restaurando…');
  await atEnsureSetup();
  const map = atMap();
  let added = { projects: 0, prompts: 0, designs: 0 };
  let imgFail = 0;

  const projRecords = await atListAll('Proyectos');
  for (const r of projRecords) {
    const f = r.fields || {};
    const localId = f.LocalId || 'at-' + r.id;
    map.projects[localId] = r.id;
    if (state.projects.some((p) => p.id === localId)) continue;
    state.projects.push({
      id: localId,
      name: f.Nombre || 'Proyecto',
      client: f.Cliente || '',
      status: AT_STATUS_KEY[f.Estado] || 'pendiente',
      dueDate: f['Fecha límite'] || '',
      price: f.Precio || '',
      payment: AT_PAY_KEY[f.Pago] || '',
      palette: f.Paleta || '',
      fonts: f['Tipografías'] || '',
      notes: f.Notas || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    added.projects++;
  }
  saveProjects();

  const promptRecords = await atListAll('Prompts');
  for (const r of promptRecords) {
    const f = r.fields || {};
    const localId = f.LocalId || 'at-' + r.id;
    map.prompts[localId] = r.id;
    if (state.prompts.some((p) => p.id === localId)) continue;
    state.prompts.push({ id: localId, title: f['Título'] || '', text: f.Texto || '', tags: parseTags(f.Etiquetas), createdAt: Date.now() });
    added.prompts++;
  }
  savePrompts();

  const recToLocalProject = Object.fromEntries(Object.entries(map.projects).map(([lid, rid]) => [rid, lid]));
  const designRecords = await atListAll('Diseños');
  for (const r of designRecords) {
    const f = r.fields || {};
    const localId = f.LocalId || 'at-' + r.id;
    map.designs[localId] = r.id;
    if (state.designs.some((d) => d.id === localId)) continue;
    const att = (f.Imagen || [])[0];
    if (!att?.url) continue; // sin imagen no hay diseño que restaurar
    let blob;
    try {
      blob = await atFetchAttachment(att.url);
    } catch {
      imgFail++;
      continue;
    }
    const processed = await processImage(blob);
    const design = {
      id: localId,
      blob: processed ? processed.full : blob,
      thumb: processed ? processed.thumb : null,
      name: f.Nombre || 'Diseño',
      tags: parseTags(f.Etiquetas),
      prompt: f.Prompt || '',
      provider: f.Motor || '',
      projectId: recToLocalProject[(f.Proyecto || [])[0]] || '',
      favorite: Boolean(f.Favorito),
      createdAt: f.Fecha ? new Date(f.Fecha + 'T12:00').getTime() : Date.now(),
    };
    await idbPutDesign(design);
    state.designs.push({
      ...design,
      url: URL.createObjectURL(design.blob),
      thumbUrl: design.thumb ? URL.createObjectURL(design.thumb) : null,
    });
    added.designs++;
  }

  atSaveMap(map);
  lsSet('atLastSync', Date.now());
  atStatus(
    `✅ Restaurado: ${added.projects} proyectos, ${added.prompts} prompts, ${added.designs} diseños` +
      (imgFail ? ` · ⚠️ ${imgFail} imágenes no bajaron` : '')
  );
  renderHome();
  renderGallery();
  renderPrompts();
  renderProjects();
}

/* ===== Auto-sincronización (hooks desde app.js) ===== */

let _atSoonTimer = null;
function atSoon() {
  if (!atReady()) return;
  clearTimeout(_atSoonTimer);
  _atSoonTimer = setTimeout(() => {
    atQueue(async () => {
      await atEnsureSetup();
      await atUpsertBatch('Proyectos', state.projects, atProjectFields, 'projects');
      await atUpsertBatch('Prompts', state.prompts, atPromptFields, 'prompts');
      lsSet('atLastSync', Date.now());
      atStatus(`✅ Sincronizado a las ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`);
    });
  }, 4000);
}

function atDesignSaved(d) {
  if (!atReady()) return;
  atQueue(async () => {
    await atEnsureSetup();
    const created = await atUpsertBatch('Diseños', [d], atDesignFields, 'designs', { sweep: false });
    if (created.length) {
      try {
        await atUploadImage(created[0].recordId, d);
      } catch (e) {
        console.warn('Airtable imagen:', e);
      }
    }
    lsSet('atLastSync', Date.now());
  });
}

function atDesignDeleted(localId) {
  if (!atReady()) return;
  atQueue(async () => {
    const map = atMap();
    const recId = map.designs[localId];
    if (!recId) return;
    const { base } = atConfig();
    await atFetch(`${AT_API}/${base}/${encodeURIComponent('Diseños')}?records[]=${recId}`, { method: 'DELETE' }).catch(() => {});
    delete map.designs[localId];
    atSaveMap(map);
  });
}
