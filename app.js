/* ============================================================
   app.js — Lógica del dashboard Flopilove.
   ============================================================ */

/* ===== Estado ===== */

const state = {
  designs: [],          // {id, blob, url, name, tags[], prompt, provider, favorite, createdAt}
  prompts: lsGet('prompts', []),
  projects: lsGet('projects', []),
  galleryFilterTag: null,
  gallerySearch: '',
  promptSearch: '',
  activeStyles: new Set(),
  lastGeneration: null, // {blob, prompt, provider}
  generating: false,
  selectMode: false,    // modo presentación en galería
  selected: new Set(),
  editingPromptId: null,
  editingProjectId: null,
  lightboxId: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  // También se usa dentro de atributos HTML, así que las comillas deben escaparse
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2600);
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function parseTags(str) {
  return (str || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Fecha de hoy en la zona horaria local (toISOString directo daría la de UTC)
function todayLocalISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Hace operable con teclado un elemento clickeable (tarjetas, miniaturas)
function makeInteractive(el) {
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.addEventListener('keydown', (e) => {
    // Solo cuando el foco está en el elemento mismo: si viene de un botón
    // interno (p. ej. mover proyecto), Enter debe activar ese botón
    if (e.target !== el) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.click();
    }
  });
}

// Opciones <option> de proyectos para los selects de vinculación
function projectOptions(selectedId, placeholder) {
  return (
    `<option value="">${placeholder}</option>` +
    state.projects
      .map((p) => `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${esc(p.name)}</option>`)
      .join('')
  );
}

/* ===== Tema ===== */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
  $('#theme-label').textContent = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';
}

function initTheme() {
  const saved = lsGet('theme', null);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    lsSet('theme', next);
    applyTheme(next);
  });
}

/* ===== Navegación ===== */

function showView(name) {
  $$('.view').forEach((v) => v.classList.remove('active'));
  $$('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  const view = $('#view-' + name);
  if (view) view.classList.add('active');
  if (name === 'studio') {
    const frame = $('#studio-frame');
    if (!frame.src) frame.src = frame.dataset.src; // carga perezosa: solo al entrar
  }
  if (name === 'inicio') renderHome();
  if (name === 'galeria') renderGallery();
  if (name === 'generar') populateGenSelects();
  if (name === 'prompts') renderPrompts();
  if (name === 'proyectos') renderProjects();
}

function populateGenSelects() {
  const resultSel = $('#result-project');
  resultSel.innerHTML = projectOptions(resultSel.value, 'Sin proyecto');

  const withKit = state.projects.filter((p) => (p.palette || '').trim() || (p.fonts || '').trim());
  $('#brand-field').hidden = withKit.length === 0;
  const brandSel = $('#gen-brand');
  const cur = brandSel.value;
  brandSel.innerHTML =
    '<option value="">Sin kit de marca</option>' +
    withKit
      .map((p) => `<option value="${p.id}"${p.id === cur ? ' selected' : ''}>${esc(p.name)}${p.client ? ' · ' + esc(p.client) : ''}</option>`)
      .join('');
}

function initNav() {
  $$('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
  // Botones "ir a" (acciones rápidas del inicio)
  document.body.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]');
    if (!goto) return;
    showView(goto.dataset.goto);
    if (goto.dataset.action === 'upload') $('#file-input').click();
    if (goto.dataset.action === 'new-project') openProjectModal();
  });
}

/* ===== Persistencia ligera ===== */

function savePrompts() {
  lsSet('prompts', state.prompts);
  atSoon(); // sincronización con Airtable (si está configurada)
}
function saveProjects() {
  lsSet('projects', state.projects);
  atSoon();
}

/* ===== Inicio ===== */

function renderHome() {
  const inProgress = state.projects.filter((p) => p.status === 'proceso');
  const delivered = state.projects.filter((p) => p.status === 'entregado');

  $('#stat-row').innerHTML = `
    <div class="stat-tile">
      <div class="stat-value">${state.designs.length}</div>
      <div class="stat-label">🖼 Diseños guardados</div>
    </div>
    <div class="stat-tile">
      <div class="stat-value">${state.prompts.length}</div>
      <div class="stat-label">✏️ Prompts en biblioteca</div>
    </div>
    <div class="stat-tile">
      <div class="stat-value">${inProgress.length}</div>
      <div class="stat-label"><span class="status-dot status-proceso"></span> Proyectos en proceso</div>
    </div>
    <div class="stat-tile">
      <div class="stat-value">${delivered.length}</div>
      <div class="stat-label"><span class="status-dot status-entregado"></span> Entregados</div>
    </div>
  `;

  // Próximas entregas (máx. 3, más urgentes primero)
  const upcoming = state.projects
    .filter((p) => p.status !== 'entregado' && p.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  $('#deadlines-section').hidden = upcoming.length === 0;
  const dl = $('#deadline-list');
  dl.innerHTML = '';
  const today = todayLocalISO();
  upcoming.forEach((p) => {
    const days = Math.round((new Date(p.dueDate + 'T12:00') - new Date(today + 'T12:00')) / 86400000);
    const label =
      days < 0 ? `atrasado hace ${-days} día${days === -1 ? '' : 's'}`
      : days === 0 ? 'vence hoy'
      : days === 1 ? 'vence mañana'
      : `en ${days} días`;
    const item = document.createElement('div');
    item.className = 'deadline-item';
    item.innerHTML = `
      <span class="status-dot status-${p.status}"></span>
      <div>
        <div class="deadline-name">${esc(p.name)}</div>
        ${p.client ? `<div class="deadline-client">${esc(p.client)}</div>` : ''}
      </div>
      <span class="deadline-days${days <= 0 ? ' overdue' : ''}">📅 ${label}</span>
    `;
    item.addEventListener('click', () => {
      showView('proyectos');
      openProjectModal(p.id);
    });
    makeInteractive(item);
    dl.appendChild(item);
  });

  const recent = [...state.designs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const grid = $('#recent-grid');
  $('#recent-empty').hidden = recent.length > 0;
  grid.querySelectorAll('.thumb').forEach((n) => n.remove());
  recent.forEach((d) => {
    const div = document.createElement('div');
    div.className = 'thumb';
    div.innerHTML = `<img src="${d.thumbUrl || d.url}" alt="${esc(d.name)}">`;
    div.addEventListener('click', () => openLightbox(d.id));
    makeInteractive(div);
    grid.appendChild(div);
  });

  const list = $('#home-projects');
  $('#home-projects-empty').hidden = inProgress.length > 0;
  list.querySelectorAll('.project-card').forEach((n) => n.remove());
  inProgress.slice(0, 4).forEach((p) => list.appendChild(projectCard(p, { compact: true })));
}

/* ===== Galería ===== */

async function loadDesigns() {
  try {
    const rows = await idbGetAllDesigns();
    state.designs = rows.map((d) => ({
      ...d,
      url: URL.createObjectURL(d.blob),
      thumbUrl: d.thumb ? URL.createObjectURL(d.thumb) : null,
    }));
  } catch {
    state.designs = []; // IndexedDB no disponible: la app sigue funcionando sin persistencia
  }
}

// Registro completo de un diseño para IndexedDB (una sola fuente de verdad)
function designRecord(d) {
  return {
    id: d.id,
    blob: d.blob,
    thumb: d.thumb || null,
    name: d.name,
    tags: d.tags,
    prompt: d.prompt,
    provider: d.provider,
    projectId: d.projectId || '',
    favorite: d.favorite,
    createdAt: d.createdAt,
  };
}

function allGalleryTags() {
  const tags = new Set();
  state.designs.forEach((d) => (d.tags || []).forEach((t) => tags.add(t)));
  return [...tags].sort();
}

function renderGallery() {
  const tagRow = $('#gallery-tags');
  const tags = allGalleryTags();
  tagRow.innerHTML = '';
  tags.forEach((tag) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (state.galleryFilterTag === tag ? ' active' : '');
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      state.galleryFilterTag = state.galleryFilterTag === tag ? null : tag;
      renderGallery();
    });
    tagRow.appendChild(chip);
  });

  const q = state.gallerySearch.toLowerCase();
  const filtered = state.designs
    .filter((d) => !state.galleryFilterTag || (d.tags || []).includes(state.galleryFilterTag))
    .filter((d) => {
      if (!q) return true;
      const hay = [d.name, (d.tags || []).join(' '), d.prompt].join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => (b.favorite - a.favorite) || (b.createdAt - a.createdAt));

  const grid = $('#gallery-grid');
  grid.innerHTML = '';
  $('#gallery-empty').hidden = state.designs.length > 0;
  $('#gallery-noresults').hidden = !(state.designs.length > 0 && filtered.length === 0);

  filtered.forEach((d) => {
    const card = document.createElement('div');
    const isSel = state.selected.has(d.id);
    card.className = 'design-card' + (isSel ? ' selected' : '');
    card.innerHTML = `
      <div class="img-wrap">
        <img src="${d.thumbUrl || d.url}" alt="${esc(d.name)}" loading="lazy">
        ${d.favorite ? '<span class="fav-badge">★</span>' : ''}
        ${state.selectMode ? `<span class="select-badge">${isSel ? '✓' : ''}</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-name">${esc(d.name) || 'Sin nombre'}</div>
        <div class="card-tags">${(d.tags || []).map(esc).join(' · ')}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      if (state.selectMode) {
        if (state.selected.has(d.id)) state.selected.delete(d.id);
        else state.selected.add(d.id);
        updatePresentButtons();
        renderGallery();
      } else {
        openLightbox(d.id);
      }
    });
    makeInteractive(card);
    grid.appendChild(card);
  });
}

async function addDesignFromBlob(blob, { name = '', tags = [], prompt = '', provider = '', projectId = '' } = {}) {
  // Comprime a WebP y genera miniatura; null = el navegador no puede decodificarla (HEIC, etc.)
  const processed = await processImage(blob);
  if (!processed) throw new Error('FORMATO_NO_SOPORTADO');
  const design = {
    id: uid(),
    blob: processed.full,
    thumb: processed.thumb,
    name: name || 'Diseño ' + formatDate(Date.now()),
    tags,
    prompt,
    provider,
    projectId,
    favorite: false,
    createdAt: Date.now(),
  };
  await idbPutDesign(design);
  const item = {
    ...design,
    url: URL.createObjectURL(design.blob),
    thumbUrl: design.thumb ? URL.createObjectURL(design.thumb) : null,
  };
  state.designs.push(item);
  atDesignSaved(item);
  return design;
}

async function handleFiles(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (!images.length) return;
  let added = 0;
  let failed = 0;
  for (const file of images) {
    try {
      await addDesignFromBlob(file, { name: file.name.replace(/\.[^.]+$/, '') });
      added++;
    } catch (err) {
      if (err && err.message === 'FORMATO_NO_SOPORTADO') {
        failed++;
      } else {
        // Error de almacenamiento (cuota llena, IndexedDB caído): no es culpa del formato
        toast('⚠️ No se pudo guardar (¿almacenamiento lleno?). Exporta un respaldo y libera espacio.');
        break;
      }
    }
  }
  if (added && failed) toast(`${added} agregado${added > 1 ? 's' : ''} ✨ · ⚠️ ${failed} en formato no compatible (¿HEIC?)`);
  else if (added) toast(`${added} diseño${added > 1 ? 's' : ''} agregado${added > 1 ? 's' : ''} ✨`);
  else if (failed) toast('⚠️ Formato no compatible (¿foto HEIC de iPhone?). Conviértela a JPG o PNG.');
  renderGallery();
  renderHome();
}

function initGallery() {
  $('#btn-upload').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  });

  $('#gallery-search').addEventListener('input', debounce((e) => {
    state.gallerySearch = e.target.value;
    renderGallery();
  }, 150));

  // Modo presentación: seleccionar diseños y exportarlos como página para el cliente
  $('#btn-present').addEventListener('click', () => {
    state.selectMode = !state.selectMode;
    if (!state.selectMode) state.selected.clear();
    updatePresentButtons();
    renderGallery();
  });
  $('#btn-present-export').addEventListener('click', exportPresentation);

  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); })
  );
  dz.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
}

function updatePresentButtons() {
  $('#btn-present').textContent = state.selectMode ? '✕ Cancelar' : '🎁 Presentación';
  const btn = $('#btn-present-export');
  btn.hidden = !state.selectMode;
  btn.textContent = `Exportar (${state.selected.size})`;
  btn.disabled = state.selected.size === 0;
}

async function exportPresentation() {
  const chosen = state.designs.filter((d) => state.selected.has(d.id));
  if (!chosen.length) return;
  const rawTitle = window.prompt('Título de la presentación:', 'Propuesta de diseño');
  if (rawTitle === null) return; // Cancelar cancela de verdad
  const title = rawTitle.trim() || 'Propuesta de diseño';
  toast('Preparando presentación…');
  const items = [];
  for (const d of chosen) {
    items.push({ name: d.name, img: await blobToDataURL(d.blob) });
  }
  const blob = new Blob([presentationHTML(title, items)], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `presentacion-${todayLocalISO()}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
  state.selectMode = false;
  state.selected.clear();
  updatePresentButtons();
  renderGallery();
  toast('Presentación descargada 🎁 — envíasela a tu cliente');
}

function presentationHTML(title, items) {
  const cards = items
    .map(
      (it) => `
    <figure>
      <img src="${it.img}" alt="${esc(it.name)}">
      <figcaption>${esc(it.name)}</figcaption>
    </figure>`
    )
    .join('');
  const fecha = new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#111013;color:#f4f2ee;padding:48px 24px}
  header{max-width:960px;margin:0 auto 36px;text-align:center}
  h1{font-size:30px;letter-spacing:-.4px;margin:0}
  .sub{color:#a5a099;margin-top:8px;font-size:14px}
  main{max-width:960px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px}
  figure{margin:0;background:#1c1a1f;border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden}
  img{width:100%;display:block}
  figcaption{padding:12px 16px;font-size:14px;color:#d9d5cd}
  footer{max-width:960px;margin:44px auto 0;text-align:center;color:#7a766f;font-size:12.5px}
</style></head><body>
<header><h1>${esc(title)}</h1><p class="sub">${items.length} diseño${items.length > 1 ? 's' : ''} · ${fecha}</p></header>
<main>${cards}</main>
<footer>Hecho con 🎨 Flopilove</footer>
</body></html>`;
}

/* ===== Lightbox ===== */

function openLightbox(id) {
  const d = state.designs.find((x) => x.id === id);
  if (!d) return;
  state.lightboxId = id;
  $('#lightbox-img').src = d.url;
  $('#lightbox-name').value = d.name || '';
  $('#lightbox-tags').value = (d.tags || []).join(', ');
  $('#lightbox-project').innerHTML = projectOptions(d.projectId || '', 'Sin proyecto');
  $('#lightbox-date').textContent =
    'Creado el ' + formatDate(d.createdAt) + (d.provider ? ` · motor: ${d.provider}` : '');
  const hasPrompt = Boolean(d.prompt);
  $('#lightbox-prompt-wrap').hidden = !hasPrompt;
  if (hasPrompt) $('#lightbox-prompt').textContent = d.prompt;
  $('#btn-lightbox-fav').textContent = d.favorite ? '★ Quitar favorito' : '☆ Favorito';
  $('#lightbox').hidden = false;
}

function initLightbox() {
  $('#btn-lightbox-save').addEventListener('click', async () => {
    const d = state.designs.find((x) => x.id === state.lightboxId);
    if (!d) return;
    d.name = $('#lightbox-name').value.trim();
    d.tags = parseTags($('#lightbox-tags').value);
    d.projectId = $('#lightbox-project').value;
    await idbPutDesign(designRecord(d));
    atDesignSaved(d);
    toast('Diseño actualizado 💾');
    $('#lightbox').hidden = true;
    renderGallery();
    renderHome();
    renderProjects();
  });

  $('#btn-lightbox-fav').addEventListener('click', async () => {
    const d = state.designs.find((x) => x.id === state.lightboxId);
    if (!d) return;
    d.favorite = !d.favorite;
    await idbPutDesign(designRecord(d));
    atDesignSaved(d);
    $('#btn-lightbox-fav').textContent = d.favorite ? '★ Quitar favorito' : '☆ Favorito';
    renderGallery();
  });

  $('#btn-lightbox-download').addEventListener('click', () => {
    const d = state.designs.find((x) => x.id === state.lightboxId);
    if (!d) return;
    const EXT = { 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/jpeg': '.jpg' };
    const a = document.createElement('a');
    a.href = d.url;
    a.download = (d.name || 'diseno') + (EXT[d.blob.type] || '.png');
    a.click();
  });

  $('#btn-lightbox-delete').addEventListener('click', async () => {
    const d = state.designs.find((x) => x.id === state.lightboxId);
    if (!d) return;
    if (!confirm('¿Eliminar este diseño? No hay vuelta atrás.')) return;
    await idbDeleteDesign(d.id);
    URL.revokeObjectURL(d.url);
    if (d.thumbUrl) URL.revokeObjectURL(d.thumbUrl);
    state.selected.delete(d.id);
    state.designs = state.designs.filter((x) => x.id !== d.id);
    atDesignDeleted(d.id);
    $('#lightbox').hidden = true;
    toast('Diseño eliminado');
    renderGallery();
    renderHome();
  });
}

/* ===== Generar ===== */

function initGenerate() {
  const select = $('#gen-provider');
  getAvailableProviders().forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    opt.disabled = !p.available;
    select.appendChild(opt);
  });

  const modelSelect = $('#gen-ogai-model');
  OGAI_MODELS.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.ep;
    opt.textContent = m.name;
    modelSelect.appendChild(opt);
  });

  const updateNote = () => {
    const p = getProvider(select.value);
    $('#provider-note').textContent = p.note || '';
    $('#ogai-model-field').hidden = !p.hasModels;
  };
  select.addEventListener('change', updateNote);
  updateNote();

  $$('#style-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const style = chip.dataset.style;
      if (state.activeStyles.has(style)) state.activeStyles.delete(style);
      else state.activeStyles.add(style);
      chip.classList.toggle('active');
    });
  });

  $('#btn-generate').addEventListener('click', generateDesign);
  $('#btn-regenerate').addEventListener('click', generateDesign);

  $('#btn-save-prompt').addEventListener('click', () => {
    const text = fullPrompt();
    if (!text) { toast('Escribe un prompt primero ✏️'); return; }
    openPromptModal(null, { text });
  });

  $('#btn-save-design').addEventListener('click', async () => {
    if (!state.lastGeneration) return;
    const btn = $('#btn-save-design');
    btn.disabled = true; // evita duplicados por doble clic
    const { blob, prompt, provider } = state.lastGeneration;
    try {
      await addDesignFromBlob(blob, {
        name: $('#result-name').value.trim(),
        tags: parseTags($('#result-tags').value),
        prompt,
        provider,
        projectId: $('#result-project').value,
      });
      btn.textContent = '✓ Guardado';
      toast('Guardado en tu galería 🖼');
      renderGallery();
      renderHome();
      renderProjects();
    } catch {
      btn.disabled = false;
      toast('⚠️ No se pudo guardar el diseño. Intenta de nuevo.');
    }
  });
}

function fullPrompt() {
  const base = $('#gen-prompt').value.trim();
  if (!base) return '';
  const parts = [base, ...state.activeStyles];
  // Kit de marca del cliente: inyecta paleta y tipografías del proyecto elegido
  const brand = state.projects.find((p) => p.id === $('#gen-brand').value);
  if (brand) {
    if ((brand.palette || '').trim()) parts.push(`paleta de colores: ${brand.palette.trim()}`);
    if ((brand.fonts || '').trim()) parts.push(`tipografías: ${brand.fonts.trim()}`);
  }
  return parts.join(', ');
}

async function generateDesign() {
  if (state.generating) return; // evita generaciones simultáneas en carrera
  const prompt = fullPrompt();
  if (!prompt) { toast('Escribe un prompt primero ✏️'); return; }

  const providerId = $('#gen-provider').value;
  const provider = getProvider(providerId);
  const size = $('#gen-size').value;

  state.generating = true;
  $('#result-placeholder').hidden = true;
  $('#result-content').hidden = true;
  $('#result-loading').hidden = false;
  $('#btn-generate').disabled = true;
  $('#btn-regenerate').disabled = true;

  try {
    const model = provider.hasModels ? $('#gen-ogai-model').value : undefined;
    const blob = await provider.generate({ prompt, size, model });
    state.lastGeneration = { blob, prompt, provider: provider.id };
    const url = URL.createObjectURL(blob);
    const img = $('#result-img');
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    img.src = url;
    img.dataset.url = url;
    if (!$('#result-name').value) {
      $('#result-name').value = prompt.slice(0, 48);
    }
    const saveBtn = $('#btn-save-design');
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Guardar en galería';
    $('#result-loading').hidden = true;
    $('#result-content').hidden = false;
  } catch (err) {
    $('#result-loading').hidden = true;
    $('#result-placeholder').hidden = false;
    const msg = err.message === 'Failed to fetch'
      ? 'No se pudo conectar con el motor. Revisa tu conexión e intenta de nuevo.'
      : err.message || 'No se pudo generar. Intenta de nuevo.';
    toast('⚠️ ' + msg);
  } finally {
    state.generating = false;
    $('#btn-generate').disabled = false;
    $('#btn-regenerate').disabled = false;
  }
}

/* ===== Prompts ===== */

function renderPrompts() {
  const q = state.promptSearch.toLowerCase();
  const filtered = state.prompts
    .filter((p) => {
      if (!q) return true;
      return [p.title, p.text, (p.tags || []).join(' ')].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const grid = $('#prompt-grid');
  grid.innerHTML = '';
  $('#prompts-empty').hidden = state.prompts.length > 0;
  $('#prompts-noresults').hidden = !(state.prompts.length > 0 && filtered.length === 0);

  filtered.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'prompt-card';
    card.innerHTML = `
      <h3>${esc(p.title) || 'Sin título'}</h3>
      <p class="prompt-text">${esc(p.text)}</p>
      <div class="card-tags">${(p.tags || []).map(esc).join(' · ')}</div>
      <div class="prompt-actions">
        <button class="btn btn-sm" data-act="use">⚡ Usar</button>
        <button class="btn btn-sm" data-act="studio">🎬 Studio</button>
        <button class="btn btn-sm" data-act="copy">📋 Copiar</button>
        <button class="btn btn-sm btn-ghost" data-act="edit">Editar</button>
        <button class="btn btn-sm btn-ghost" data-act="delete">🗑</button>
      </div>
    `;
    card.querySelector('[data-act="use"]').addEventListener('click', () => {
      $('#gen-prompt').value = p.text;
      // Los chips de estilo activos se limpian para no colarse en el prompt guardado
      state.activeStyles.clear();
      $$('#style-chips .chip').forEach((c) => c.classList.remove('active'));
      showView('generar');
      toast('Prompt cargado en el generador ⚡');
    });
    card.querySelector('[data-act="studio"]').addEventListener('click', () => sendPromptToStudio(p.text));
    card.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      await navigator.clipboard.writeText(p.text);
      toast('Prompt copiado 📋');
    });
    card.querySelector('[data-act="edit"]').addEventListener('click', () => openPromptModal(p.id));
    card.querySelector('[data-act="delete"]').addEventListener('click', () => {
      if (!confirm('¿Eliminar este prompt?')) return;
      state.prompts = state.prompts.filter((x) => x.id !== p.id);
      savePrompts();
      renderPrompts();
      renderHome();
    });
    grid.appendChild(card);
  });
}

function openPromptModal(id = null, prefill = {}) {
  state.editingPromptId = id;
  const p = id ? state.prompts.find((x) => x.id === id) : null;
  $('#prompt-modal-title').textContent = id ? 'Editar prompt' : 'Nuevo prompt';
  $('#prompt-title').value = p?.title || prefill.title || '';
  $('#prompt-text').value = p?.text || prefill.text || '';
  $('#prompt-tags').value = (p?.tags || []).join(', ');
  $('#prompt-modal').hidden = false;
}

function initPrompts() {
  $('#btn-new-prompt').addEventListener('click', () => openPromptModal());
  $('#prompt-search').addEventListener('input', (e) => {
    state.promptSearch = e.target.value;
    renderPrompts();
  });

  $('#btn-prompt-save').addEventListener('click', () => {
    const title = $('#prompt-title').value.trim();
    const text = $('#prompt-text').value.trim();
    if (!text) { toast('El prompt no puede estar vacío'); return; }
    const tags = parseTags($('#prompt-tags').value);

    if (state.editingPromptId) {
      const p = state.prompts.find((x) => x.id === state.editingPromptId);
      Object.assign(p, { title, text, tags });
    } else {
      state.prompts.push({ id: uid(), title, text, tags, createdAt: Date.now() });
    }
    savePrompts();
    $('#prompt-modal').hidden = true;
    toast('Prompt guardado 💾');
    renderPrompts();
    renderHome();
  });
}

// Abre el Studio embebido con un prompt precargado (vía ?prompt=)
function sendPromptToStudio(text) {
  const frame = $('#studio-frame');
  frame.src = frame.dataset.src + '?prompt=' + encodeURIComponent(text);
  showView('studio');
  toast('Prompt enviado al Studio 🎬');
}

/* ===== Proyectos ===== */

const STATUS_ORDER = ['pendiente', 'proceso', 'entregado'];
const STATUS_LABEL = { pendiente: 'Pendiente', proceso: 'En proceso', entregado: 'Entregado' };

function projectCard(p, { compact = false } = {}) {
  const card = document.createElement('div');
  card.className = 'project-card';

  let dueHTML = '';
  if (p.dueDate) {
    // Comparación en fecha local: toISOString() usaría UTC y marcaría "atrasado" antes de tiempo
    const overdue = p.status !== 'entregado' && p.dueDate < todayLocalISO();
    dueHTML = `<div class="project-due${overdue ? ' overdue' : ''}">📅 ${esc(p.dueDate)}${overdue ? ' · atrasado' : ''}</div>`;
  }

  const PAY_LABEL = { pagado: 'Pagado', parcial: 'Pago parcial', pendiente: 'Pago pendiente' };
  // Object.hasOwn evita valores inyectados (p. ej. desde un respaldo manipulado)
  const payLabel = Object.hasOwn(PAY_LABEL, p.payment) ? PAY_LABEL[p.payment] : null;
  const payHTML = payLabel ? `<span class="pay-chip pay-${p.payment}">💰 ${payLabel}${p.price ? ' · ' + esc(p.price) : ''}</span>` : '';
  const nDesigns = state.designs.filter((d) => d.projectId === p.id).length;
  const countHTML = nDesigns ? `<span class="design-count">🖼 ${nDesigns} diseño${nDesigns > 1 ? 's' : ''}</span>` : '';
  const swatches = (p.palette || '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c))
    .slice(0, 6);
  const swatchHTML = swatches.length
    ? `<div class="swatch-row">${swatches.map((c) => `<span class="swatch" style="background:${c}"></span>`).join('')}</div>`
    : '';

  const idx = STATUS_ORDER.indexOf(p.status);
  const moveHTML = compact ? '' : `
    <div class="project-move">
      ${idx > 0 ? `<button data-move="-1">← ${STATUS_LABEL[STATUS_ORDER[idx - 1]]}</button>` : ''}
      ${idx < 2 ? `<button data-move="1">${STATUS_LABEL[STATUS_ORDER[idx + 1]]} →</button>` : ''}
    </div>
  `;

  card.innerHTML = `
    <div class="project-name">${esc(p.name)}</div>
    ${p.client ? `<div class="project-client">${esc(p.client)}</div>` : ''}
    ${dueHTML}
    ${payHTML}${countHTML}
    ${swatchHTML}
    ${moveHTML}
  `;
  makeInteractive(card);

  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-move]')) return;
    openProjectModal(p.id);
  });

  card.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = Number(btn.dataset.move);
      const i = STATUS_ORDER.indexOf(p.status);
      p.status = STATUS_ORDER[Math.min(2, Math.max(0, i + delta))];
      p.updatedAt = Date.now();
      saveProjects();
      renderProjects();
      renderHome();
    });
  });

  return card;
}

function renderProjects() {
  STATUS_ORDER.forEach((status) => {
    const col = $('#col-' + status);
    col.innerHTML = '';
    const items = state.projects
      .filter((p) => p.status === status)
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    $('#count-' + status).textContent = items.length;
    items.forEach((p) => col.appendChild(projectCard(p)));
  });
}

function openProjectModal(id = null) {
  state.editingProjectId = id;
  const p = id ? state.projects.find((x) => x.id === id) : null;
  $('#project-modal-title').textContent = id ? 'Editar proyecto' : 'Nuevo proyecto';
  $('#project-name').value = p?.name || '';
  $('#project-client').value = p?.client || '';
  $('#project-status').value = p?.status || 'pendiente';
  $('#project-due').value = p?.dueDate || '';
  $('#project-price').value = p?.price || '';
  $('#project-payment').value = p?.payment || '';
  $('#project-palette').value = p?.palette || '';
  $('#project-fonts').value = p?.fonts || '';
  $('#project-notes').value = p?.notes || '';
  const linked = id ? state.designs.filter((d) => d.projectId === id) : [];
  $('#project-designs-wrap').hidden = linked.length === 0;
  $('#project-designs').innerHTML = linked
    .slice(0, 12)
    .map((d) => `<img src="${d.thumbUrl || d.url}" alt="${esc(d.name)}" title="${esc(d.name)}">`)
    .join('');
  $('#btn-project-delete').hidden = !id;
  $('#project-modal').hidden = false;
}

function initProjects() {
  $('#btn-new-project').addEventListener('click', () => openProjectModal());

  // Exporta las fechas límite pendientes como calendario .ics (Google/Apple Calendar)
  $('#btn-ics').addEventListener('click', () => {
    const withDue = state.projects.filter((p) => p.dueDate && p.status !== 'entregado');
    if (!withDue.length) { toast('No hay proyectos con fecha límite pendiente 📅'); return; }
    // Los saltos de línea también se neutralizan: romperían el formato ICS
    const icsText = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/([,;\\])/g, '\\$1');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Flopilove//Dashboard//ES', 'CALSCALE:GREGORIAN'];
    withDue.forEach((p) => {
      // Día siguiente calculado con partes de fecha locales (sin pasar por UTC)
      const [y, m, dd] = p.dueDate.split('-').map(Number);
      const next = new Date(y, m - 1, dd + 1);
      const nextStr =
        String(next.getFullYear()) +
        String(next.getMonth() + 1).padStart(2, '0') +
        String(next.getDate()).padStart(2, '0');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${p.id}@flopilove`,
        `DTSTAMP:${todayLocalISO().replace(/-/g, '')}T000000Z`,
        `DTSTART;VALUE=DATE:${p.dueDate.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${nextStr}`,
        `SUMMARY:${icsText('Entrega: ' + p.name + (p.client ? ' (' + p.client + ')' : ''))}`,
        'END:VEVENT'
      );
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'entregas-flopilove.ics';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Calendario descargado 📅 — ábrelo para importar tus entregas');
  });

  $('#btn-project-save').addEventListener('click', () => {
    const name = $('#project-name').value.trim();
    if (!name) { toast('Ponle nombre al proyecto'); return; }
    const data = {
      name,
      client: $('#project-client').value.trim(),
      status: $('#project-status').value,
      dueDate: $('#project-due').value,
      price: $('#project-price').value.trim(),
      payment: $('#project-payment').value,
      palette: $('#project-palette').value.trim(),
      fonts: $('#project-fonts').value.trim(),
      notes: $('#project-notes').value.trim(),
      updatedAt: Date.now(),
    };
    if (state.editingProjectId) {
      const p = state.projects.find((x) => x.id === state.editingProjectId);
      Object.assign(p, data);
    } else {
      state.projects.push({ id: uid(), createdAt: Date.now(), ...data });
    }
    saveProjects();
    $('#project-modal').hidden = true;
    toast('Proyecto guardado 📁');
    renderProjects();
    renderHome();
    populateGenSelects();
  });

  $('#btn-project-delete').addEventListener('click', () => {
    if (!confirm('¿Eliminar este proyecto?')) return;
    state.projects = state.projects.filter((x) => x.id !== state.editingProjectId);
    saveProjects();
    $('#project-modal').hidden = true;
    toast('Proyecto eliminado');
    renderProjects();
    renderHome();
    populateGenSelects();
  });
}

/* ===== Ajustes ===== */

function initSettings() {
  $('#openai-key').value = lsGet('openaiKey', '');
  $('#btn-save-key').addEventListener('click', () => {
    lsSet('openaiKey', $('#openai-key').value.trim());
    toast('Clave guardada en este navegador 🔐');
  });

  $('#muapi-key').value = lsGet('muapiKey', '');
  $('#btn-save-muapi-key').addEventListener('click', () => {
    lsSet('muapiKey', $('#muapi-key').value.trim());
    toast('Clave de muapi guardada 🔐');
  });

  $('#proxy-url').value = lsGet('proxyUrl', '');
  $('#btn-save-proxy').addEventListener('click', () => {
    const v = $('#proxy-url').value.trim();
    if (v && !/^https:\/\/.+\?url=$/.test(v)) {
      toast('⚠️ La URL debe empezar con https y terminar en ?url=');
      return;
    }
    lsSet('proxyUrl', v);
    toast(v ? 'Proxy propio guardado 🔒' : 'Usando el proxy público');
  });

  // --- Airtable ---
  $('#at-token').value = lsGet('atToken', '');
  $('#at-base').value = lsGet('atBase', '');
  $('#btn-at-save').addEventListener('click', () => {
    const token = $('#at-token').value.trim();
    const base = $('#at-base').value.trim();
    if (token && !token.startsWith('pat')) { toast('⚠️ El token de Airtable empieza con "pat"'); return; }
    if (base && !base.startsWith('app')) { toast('⚠️ El ID de la base empieza con "app" (está en la URL de la base)'); return; }
    lsSet('atToken', token);
    lsSet('atBase', base);
    lsSet('atSetupDone', false); // si cambió la base, hay que re-verificar las tablas
    toast(token && base ? 'Airtable configurado ☁️ — usa "Sincronizar ahora"' : 'Airtable desconectado');
    atStatus(token && base ? 'Listo para sincronizar' : '');
  });
  $('#btn-at-sync').addEventListener('click', () => {
    if (!atReady()) { toast('⚠️ Guarda primero tu token y el ID de la base'); return; }
    atQueue(atPushAll);
  });
  $('#btn-at-pull').addEventListener('click', () => {
    if (!atReady()) { toast('⚠️ Guarda primero tu token y el ID de la base'); return; }
    atQueue(atPullAll);
  });
  const lastSync = lsGet('atLastSync', 0);
  if (atReady() && lastSync) {
    atStatus('Última sincronización: ' + new Date(lastSync).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
  }

  $('#btn-export').addEventListener('click', async () => {
    toast('Preparando respaldo…');
    // Se arma por partes y de forma secuencial para no cargar toda la
    // biblioteca en memoria de golpe (las miniaturas se regeneran al importar)
    const head = {
      app: 'flopilove-dashboard',
      version: 2,
      exportedAt: new Date().toISOString(),
      prompts: state.prompts,
      projects: state.projects,
    };
    const parts = [JSON.stringify(head).slice(0, -1) + ',"designs":['];
    for (let i = 0; i < state.designs.length; i++) {
      const d = state.designs[i];
      parts.push(
        (i ? ',' : '') +
          JSON.stringify({
            id: d.id,
            name: d.name,
            tags: d.tags,
            prompt: d.prompt,
            provider: d.provider,
            projectId: d.projectId || '',
            favorite: d.favorite,
            createdAt: d.createdAt,
            image: await blobToDataURL(d.blob),
          })
      );
    }
    parts.push(']}');
    const blob = new Blob(parts, { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flopilove-respaldo-${todayLocalISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    lsSet('lastExportAt', Date.now());
    toast('Respaldo descargado ⬇️');
  });

  $('#btn-import').addEventListener('click', () => $('#import-input').click());
  $('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload.app !== 'flopilove-dashboard') throw new Error('formato desconocido');

      for (const d of payload.designs || []) {
        if (state.designs.some((x) => x.id === d.id)) continue;
        const blob = await dataURLToBlob(d.image);
        const processed = await processImage(blob); // regenera la miniatura
        const design = {
          id: d.id,
          blob,
          thumb: processed ? processed.thumb : null,
          name: d.name,
          tags: d.tags || [],
          prompt: d.prompt || '',
          provider: d.provider || '',
          projectId: d.projectId || '',
          favorite: !!d.favorite,
          createdAt: d.createdAt || Date.now(),
        };
        await idbPutDesign(design);
        state.designs.push({
          ...design,
          url: URL.createObjectURL(blob),
          thumbUrl: design.thumb ? URL.createObjectURL(design.thumb) : null,
        });
      }
      for (const p of payload.prompts || []) {
        if (!state.prompts.some((x) => x.id === p.id)) state.prompts.push(p);
      }
      for (const p of payload.projects || []) {
        if (state.projects.some((x) => x.id === p.id)) continue;
        // Sanitiza campos que se usan en clases CSS: solo valores conocidos
        if (!STATUS_ORDER.includes(p.status)) p.status = 'pendiente';
        if (!['pendiente', 'parcial', 'pagado'].includes(p.payment)) p.payment = '';
        state.projects.push(p);
      }
      savePrompts();
      saveProjects();
      toast('Respaldo importado ✅');
      renderGallery();
      renderPrompts();
      renderProjects();
      renderHome();
    } catch (err) {
      toast('⚠️ No se pudo importar: ' + err.message);
    }
  });

  $('#btn-wipe').addEventListener('click', async () => {
    if (!confirm('Esto borra TODOS tus diseños, prompts y proyectos de este navegador. ¿Segura?')) return;
    if (!confirm('Última confirmación: ¿borrar todo?')) return;
    await idbClearDesigns();
    lsRemoveAll();
    state.designs.forEach((d) => {
      URL.revokeObjectURL(d.url);
      if (d.thumbUrl) URL.revokeObjectURL(d.thumbUrl);
    });
    state.designs = [];
    state.prompts = [];
    state.projects = [];
    state.selected.clear();
    state.selectMode = false;
    updatePresentButtons();
    toast('Datos borrados');
    renderGallery();
    renderPrompts();
    renderProjects();
    renderHome();
  });
}

/* ===== Modales genéricos ===== */

function initModals() {
  $$('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => { $('#' + btn.dataset.close).hidden = true; });
  });
  $$('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.hidden = true;
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.modal-backdrop').forEach((m) => { m.hidden = true; });
  });
}

/* ===== Arranque ===== */

async function init() {
  initTheme();
  initNav();
  initGallery();
  initLightbox();
  initGenerate();
  initPrompts();
  initProjects();
  initSettings();
  initModals();
  await loadDesigns();
  renderHome();
  renderGallery();
  renderPrompts();
  renderProjects();

  // Protección de datos: pide al navegador no borrar el almacenamiento bajo presión de espacio
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

  // PWA: la app queda instalable y funciona sin conexión
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Recordatorio de respaldo: si hay datos y no exportas hace 7+ días (máx. un aviso al día)
  const hasData = state.designs.length + state.prompts.length + state.projects.length > 0;
  const WEEK = 7 * 86400000;
  const DAY = 86400000;
  if (hasData && Date.now() - lsGet('lastExportAt', 0) > WEEK && Date.now() - lsGet('backupNudgeAt', 0) > DAY) {
    lsSet('backupNudgeAt', Date.now());
    setTimeout(() => toast('💾 Tip: exporta un respaldo en Ajustes — tus datos viven solo en este navegador'), 2500);
  }
}

init();
