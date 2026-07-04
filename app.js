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
  if (name === 'prompts') renderPrompts();
  if (name === 'proyectos') renderProjects();
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

function savePrompts() { lsSet('prompts', state.prompts); }
function saveProjects() { lsSet('projects', state.projects); }

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

  const recent = [...state.designs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const grid = $('#recent-grid');
  $('#recent-empty').hidden = recent.length > 0;
  grid.querySelectorAll('.thumb').forEach((n) => n.remove());
  recent.forEach((d) => {
    const div = document.createElement('div');
    div.className = 'thumb';
    div.innerHTML = `<img src="${d.url}" alt="${esc(d.name)}">`;
    div.addEventListener('click', () => openLightbox(d.id));
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
    state.designs = rows.map((d) => ({ ...d, url: URL.createObjectURL(d.blob) }));
  } catch {
    state.designs = []; // IndexedDB no disponible: la app sigue funcionando sin persistencia
  }
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

  filtered.forEach((d) => {
    const card = document.createElement('div');
    card.className = 'design-card';
    card.innerHTML = `
      <div class="img-wrap">
        <img src="${d.url}" alt="${esc(d.name)}" loading="lazy">
        ${d.favorite ? '<span class="fav-badge">★</span>' : ''}
      </div>
      <div class="card-body">
        <div class="card-name">${esc(d.name) || 'Sin nombre'}</div>
        <div class="card-tags">${(d.tags || []).map(esc).join(' · ')}</div>
      </div>
    `;
    card.addEventListener('click', () => openLightbox(d.id));
    grid.appendChild(card);
  });
}

async function addDesignFromBlob(blob, { name = '', tags = [], prompt = '', provider = '' } = {}) {
  const design = {
    id: uid(),
    blob,
    name: name || 'Diseño ' + formatDate(Date.now()),
    tags,
    prompt,
    provider,
    favorite: false,
    createdAt: Date.now(),
  };
  await idbPutDesign(design);
  state.designs.push({ ...design, url: URL.createObjectURL(blob) });
  return design;
}

async function handleFiles(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  for (const file of images) {
    await addDesignFromBlob(file, { name: file.name.replace(/\.[^.]+$/, '') });
  }
  toast(`${images.length} diseño${images.length > 1 ? 's' : ''} agregado${images.length > 1 ? 's' : ''} ✨`);
  renderGallery();
  renderHome();
}

function initGallery() {
  $('#btn-upload').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  });

  $('#gallery-search').addEventListener('input', (e) => {
    state.gallerySearch = e.target.value;
    renderGallery();
  });

  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); })
  );
  dz.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
}

/* ===== Lightbox ===== */

function openLightbox(id) {
  const d = state.designs.find((x) => x.id === id);
  if (!d) return;
  state.lightboxId = id;
  $('#lightbox-img').src = d.url;
  $('#lightbox-name').value = d.name || '';
  $('#lightbox-tags').value = (d.tags || []).join(', ');
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
    await idbPutDesign({ id: d.id, blob: d.blob, name: d.name, tags: d.tags, prompt: d.prompt, provider: d.provider, favorite: d.favorite, createdAt: d.createdAt });
    toast('Diseño actualizado 💾');
    $('#lightbox').hidden = true;
    renderGallery();
    renderHome();
  });

  $('#btn-lightbox-fav').addEventListener('click', async () => {
    const d = state.designs.find((x) => x.id === state.lightboxId);
    if (!d) return;
    d.favorite = !d.favorite;
    await idbPutDesign({ id: d.id, blob: d.blob, name: d.name, tags: d.tags, prompt: d.prompt, provider: d.provider, favorite: d.favorite, createdAt: d.createdAt });
    $('#btn-lightbox-fav').textContent = d.favorite ? '★ Quitar favorito' : '☆ Favorito';
    renderGallery();
  });

  $('#btn-lightbox-download').addEventListener('click', () => {
    const d = state.designs.find((x) => x.id === state.lightboxId);
    if (!d) return;
    const a = document.createElement('a');
    a.href = d.url;
    a.download = (d.name || 'diseno') + '.png';
    a.click();
  });

  $('#btn-lightbox-delete').addEventListener('click', async () => {
    const d = state.designs.find((x) => x.id === state.lightboxId);
    if (!d) return;
    if (!confirm('¿Eliminar este diseño? No hay vuelta atrás.')) return;
    await idbDeleteDesign(d.id);
    URL.revokeObjectURL(d.url);
    state.designs = state.designs.filter((x) => x.id !== d.id);
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
    const { blob, prompt, provider } = state.lastGeneration;
    await addDesignFromBlob(blob, {
      name: $('#result-name').value.trim(),
      tags: parseTags($('#result-tags').value),
      prompt,
      provider,
    });
    toast('Guardado en tu galería 🖼');
    renderGallery();
    renderHome();
  });
}

function fullPrompt() {
  const base = $('#gen-prompt').value.trim();
  if (!base) return '';
  const styles = [...state.activeStyles];
  return styles.length ? `${base}, ${styles.join(', ')}` : base;
}

async function generateDesign() {
  const prompt = fullPrompt();
  if (!prompt) { toast('Escribe un prompt primero ✏️'); return; }

  const providerId = $('#gen-provider').value;
  const provider = getProvider(providerId);
  const size = $('#gen-size').value;

  $('#result-placeholder').hidden = true;
  $('#result-content').hidden = true;
  $('#result-loading').hidden = false;
  $('#btn-generate').disabled = true;

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
    $('#btn-generate').disabled = false;
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

  filtered.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'prompt-card';
    card.innerHTML = `
      <h3>${esc(p.title) || 'Sin título'}</h3>
      <p class="prompt-text">${esc(p.text)}</p>
      <div class="card-tags">${(p.tags || []).map(esc).join(' · ')}</div>
      <div class="prompt-actions">
        <button class="btn btn-sm" data-act="use">⚡ Usar</button>
        <button class="btn btn-sm" data-act="copy">📋 Copiar</button>
        <button class="btn btn-sm btn-ghost" data-act="edit">Editar</button>
        <button class="btn btn-sm btn-ghost" data-act="delete">🗑</button>
      </div>
    `;
    card.querySelector('[data-act="use"]').addEventListener('click', () => {
      $('#gen-prompt').value = p.text;
      showView('generar');
      toast('Prompt cargado en el generador ⚡');
    });
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

/* ===== Proyectos ===== */

const STATUS_ORDER = ['pendiente', 'proceso', 'entregado'];
const STATUS_LABEL = { pendiente: 'Pendiente', proceso: 'En proceso', entregado: 'Entregado' };

function projectCard(p, { compact = false } = {}) {
  const card = document.createElement('div');
  card.className = 'project-card';

  let dueHTML = '';
  if (p.dueDate) {
    const overdue = p.status !== 'entregado' && p.dueDate < new Date().toISOString().slice(0, 10);
    dueHTML = `<div class="project-due${overdue ? ' overdue' : ''}">📅 ${esc(p.dueDate)}${overdue ? ' · atrasado' : ''}</div>`;
  }

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
    ${moveHTML}
  `;

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
  $('#project-notes').value = p?.notes || '';
  $('#btn-project-delete').hidden = !id;
  $('#project-modal').hidden = false;
}

function initProjects() {
  $('#btn-new-project').addEventListener('click', () => openProjectModal());

  $('#btn-project-save').addEventListener('click', () => {
    const name = $('#project-name').value.trim();
    if (!name) { toast('Ponle nombre al proyecto'); return; }
    const data = {
      name,
      client: $('#project-client').value.trim(),
      status: $('#project-status').value,
      dueDate: $('#project-due').value,
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
  });

  $('#btn-project-delete').addEventListener('click', () => {
    if (!confirm('¿Eliminar este proyecto?')) return;
    state.projects = state.projects.filter((x) => x.id !== state.editingProjectId);
    saveProjects();
    $('#project-modal').hidden = true;
    toast('Proyecto eliminado');
    renderProjects();
    renderHome();
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

  $('#btn-export').addEventListener('click', async () => {
    toast('Preparando respaldo…');
    const designs = await Promise.all(
      state.designs.map(async (d) => ({
        id: d.id,
        name: d.name,
        tags: d.tags,
        prompt: d.prompt,
        provider: d.provider,
        favorite: d.favorite,
        createdAt: d.createdAt,
        image: await blobToDataURL(d.blob),
      }))
    );
    const payload = {
      app: 'flopilove-dashboard',
      version: 1,
      exportedAt: new Date().toISOString(),
      designs,
      prompts: state.prompts,
      projects: state.projects,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flopilove-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
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
        const design = { id: d.id, blob, name: d.name, tags: d.tags || [], prompt: d.prompt || '', provider: d.provider || '', favorite: !!d.favorite, createdAt: d.createdAt || Date.now() };
        await idbPutDesign(design);
        state.designs.push({ ...design, url: URL.createObjectURL(blob) });
      }
      for (const p of payload.prompts || []) {
        if (!state.prompts.some((x) => x.id === p.id)) state.prompts.push(p);
      }
      for (const p of payload.projects || []) {
        if (!state.projects.some((x) => x.id === p.id)) state.projects.push(p);
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
    state.designs.forEach((d) => URL.revokeObjectURL(d.url));
    state.designs = [];
    state.prompts = [];
    state.projects = [];
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
}

init();
