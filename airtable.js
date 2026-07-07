/* ============================================================
   airtable.js — Sincronización opcional con Airtable.
   Envía y trae proyectos (y prompts, si existe la tabla) entre
   este navegador y una base de Airtable, usando un token
   personal (PAT) guardado solo en localStorage.
   Tablas esperadas: «Diseño - Proyectos» y «Diseño - Prompts»
   (el esquema exacto está documentado en el README).
   ============================================================ */

const AT_API = 'https://api.airtable.com/v0';
const AT_TABLE_PROJECTS = 'Diseño - Proyectos';
const AT_TABLE_PROMPTS = 'Diseño - Prompts';

// El estado y el pago viven en la app en minúsculas (clases CSS);
// en Airtable se muestran como opciones legibles.
const AT_STATUS_TO_REMOTE = { pendiente: 'Pendiente', proceso: 'En proceso', entregado: 'Entregado' };
const AT_STATUS_TO_LOCAL = { 'Pendiente': 'pendiente', 'En proceso': 'proceso', 'Entregado': 'entregado' };
const AT_PAY_TO_REMOTE = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado' };
const AT_PAY_TO_LOCAL = { 'Pendiente': 'pendiente', 'Parcial': 'parcial', 'Pagado': 'pagado' };

function atConfig() {
  return { token: lsGet('airtableToken', ''), base: lsGet('airtableBase', '') };
}

async function atFetch(table, { method = 'GET', body, params } = {}) {
  const { token, base } = atConfig();
  const url = new URL(`${AT_API}/${base}/${encodeURIComponent(table)}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch { /* sin cuerpo JSON */ }
    const err = new Error(
      res.status === 401 || res.status === 403 ? 'Token inválido o sin permisos sobre la base'
      : res.status === 404 ? `No se encontró la base o la tabla «${table}» (revisa el ID de la base)`
      : res.status === 429 ? 'Airtable pide esperar un momento — intenta de nuevo en unos segundos'
      : detail || `Error ${res.status} de Airtable`
    );
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Lista todos los registros de una tabla siguiendo la paginación
async function atListAll(table) {
  const records = [];
  let offset;
  do {
    const data = await atFetch(table, { params: offset ? { offset } : undefined });
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

// Upsert por «Local ID»: crea o actualiza según la clave local (máx. 10 por petición)
async function atUpsert(table, records) {
  let count = 0;
  for (let i = 0; i < records.length; i += 10) {
    const data = await atFetch(table, {
      method: 'PATCH',
      body: {
        performUpsert: { fieldsToMergeOn: ['Local ID'] },
        records: records.slice(i, i + 10),
        typecast: true,
      },
    });
    count += (data.records || []).length;
  }
  return count;
}

/* ===== Mapeo proyecto <-> registro ===== */

function atProjectFields(p) {
  return {
    'Nombre': p.name || '',
    'Cliente': p.client || '',
    'Estado': AT_STATUS_TO_REMOTE[p.status] || 'Pendiente',
    'Fecha límite': p.dueDate || null,
    'Precio': p.price || '',
    'Pago': AT_PAY_TO_REMOTE[p.payment] || null,
    'Paleta': p.palette || '',
    'Tipografías': p.fonts || '',
    'Notas': p.notes || '',
    'Local ID': p.id,
    'Actualizado': new Date(p.updatedAt || p.createdAt || Date.now()).toISOString(),
  };
}

function atFieldsToProject(f) {
  return {
    name: (f['Nombre'] || '').trim() || 'Sin nombre',
    client: f['Cliente'] || '',
    status: AT_STATUS_TO_LOCAL[f['Estado']] || 'pendiente',
    dueDate: f['Fecha límite'] || '',
    price: f['Precio'] || '',
    payment: AT_PAY_TO_LOCAL[f['Pago']] || '',
    palette: f['Paleta'] || '',
    fonts: f['Tipografías'] || '',
    notes: f['Notas'] || '',
  };
}

/* ===== Sincronización ===== */

async function atPush() {
  const sent = { projects: 0, prompts: 0, promptsSkipped: false };
  sent.projects = await atUpsert(AT_TABLE_PROJECTS,
    state.projects.map((p) => ({ fields: atProjectFields(p) })));
  try {
    sent.prompts = await atUpsert(AT_TABLE_PROMPTS, state.prompts.map((p) => ({
      fields: {
        'Título': p.title || '',
        'Prompt': p.text || '',
        'Etiquetas': (p.tags || []).join(', '),
        'Local ID': p.id,
      },
    })));
  } catch (err) {
    // La tabla de prompts es opcional: si no existe, los proyectos igual quedan sincronizados
    if (err.status === 404 || err.status === 422) sent.promptsSkipped = true;
    else throw err;
  }
  return sent;
}

async function atPull() {
  const result = { projects: 0, prompts: 0, promptsSkipped: false };
  const writeBack = [];

  const remote = await atListAll(AT_TABLE_PROJECTS);
  for (const rec of remote) {
    const f = rec.fields || {};
    let localId = (f['Local ID'] || '').trim();
    if (!localId) {
      // Registro creado a mano en Airtable: se adopta y se le asigna clave local
      localId = uid();
      writeBack.push({ id: rec.id, fields: { 'Local ID': localId } });
    }
    const data = atFieldsToProject(f);
    const existing = state.projects.find((p) => p.id === localId);
    if (existing) Object.assign(existing, data, { updatedAt: Date.now() });
    else state.projects.push({ id: localId, createdAt: Date.now(), updatedAt: Date.now(), ...data });
    result.projects++;
  }
  for (let i = 0; i < writeBack.length; i += 10) {
    await atFetch(AT_TABLE_PROJECTS, { method: 'PATCH', body: { records: writeBack.slice(i, i + 10) } });
  }
  saveProjects();

  try {
    const remotePrompts = await atListAll(AT_TABLE_PROMPTS);
    const promptWriteBack = [];
    for (const rec of remotePrompts) {
      const f = rec.fields || {};
      const text = (f['Prompt'] || '').trim();
      if (!text) continue; // un prompt sin texto no sirve en la app
      let localId = (f['Local ID'] || '').trim();
      if (!localId) {
        localId = uid();
        promptWriteBack.push({ id: rec.id, fields: { 'Local ID': localId } });
      }
      const data = { title: f['Título'] || '', text, tags: parseTags(f['Etiquetas'] || '') };
      const existing = state.prompts.find((p) => p.id === localId);
      if (existing) Object.assign(existing, data);
      else state.prompts.push({ id: localId, createdAt: Date.now(), ...data });
      result.prompts++;
    }
    for (let i = 0; i < promptWriteBack.length; i += 10) {
      await atFetch(AT_TABLE_PROMPTS, { method: 'PATCH', body: { records: promptWriteBack.slice(i, i + 10) } });
    }
    savePrompts();
  } catch (err) {
    if (err.status === 404 || err.status === 422) result.promptsSkipped = true;
    else throw err;
  }

  return result;
}

/* ===== UI (tarjeta en Ajustes) ===== */

function atRenderStatus() {
  const t = lsGet('airtableLastSyncAt', 0);
  $('#airtable-status').textContent = t
    ? 'Última sincronización: ' + new Date(t).toLocaleString('es')
    : '';
}

function atEnsureConfig() {
  const { token, base } = atConfig();
  if (!token || !base) {
    toast('⚠️ Guarda primero tu token y el ID de la base de Airtable');
    return false;
  }
  return true;
}

async function atRun(btn, fn) {
  const buttons = [$('#btn-airtable-push'), $('#btn-airtable-pull'), $('#btn-save-airtable')];
  buttons.forEach((b) => { b.disabled = true; });
  const original = btn.textContent;
  btn.textContent = '⏳ Sincronizando…';
  try {
    await fn();
    lsSet('airtableLastSyncAt', Date.now());
    atRenderStatus();
  } catch (err) {
    toast('⚠️ ' + (err.message === 'Failed to fetch'
      ? 'No se pudo conectar con Airtable. Revisa tu conexión.'
      : err.message));
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
    btn.textContent = original;
  }
}

function initAirtable() {
  $('#airtable-token').value = lsGet('airtableToken', '');
  $('#airtable-base').value = lsGet('airtableBase', '');
  atRenderStatus();

  $('#btn-save-airtable').addEventListener('click', async () => {
    lsSet('airtableToken', $('#airtable-token').value.trim());
    lsSet('airtableBase', $('#airtable-base').value.trim());
    const { token, base } = atConfig();
    if (!token || !base) {
      toast('Datos de Airtable guardados 🔐');
      return;
    }
    // Prueba la conexión de inmediato para avisar si algo falta
    try {
      await atFetch(AT_TABLE_PROJECTS, { params: { pageSize: '1' } });
      toast('Airtable conectado ✅');
    } catch (err) {
      toast('⚠️ ' + err.message);
    }
  });

  $('#btn-airtable-push').addEventListener('click', () => {
    if (!atEnsureConfig()) return;
    if (!state.projects.length && !state.prompts.length) {
      toast('No hay proyectos ni prompts que enviar todavía');
      return;
    }
    atRun($('#btn-airtable-push'), async () => {
      const sent = await atPush();
      const parts = [`${sent.projects} proyecto${sent.projects === 1 ? '' : 's'}`];
      if (sent.prompts) parts.push(`${sent.prompts} prompt${sent.prompts === 1 ? '' : 's'}`);
      toast(`⬆️ Enviado a Airtable: ${parts.join(' y ')}` +
        (sent.promptsSkipped && state.prompts.length ? ' (sin tabla de prompts, se omitieron)' : ''));
    });
  });

  $('#btn-airtable-pull').addEventListener('click', () => {
    if (!atEnsureConfig()) return;
    atRun($('#btn-airtable-pull'), async () => {
      const got = await atPull();
      renderProjects();
      renderPrompts();
      renderHome();
      populateGenSelects();
      const parts = [`${got.projects} proyecto${got.projects === 1 ? '' : 's'}`];
      if (got.prompts) parts.push(`${got.prompts} prompt${got.prompts === 1 ? '' : 's'}`);
      toast(`⬇️ Traído de Airtable: ${parts.join(' y ')}`);
    });
  });
}

initAirtable();
