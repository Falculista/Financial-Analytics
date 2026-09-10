/* ==================================================================================
   6. HELPERS DE DOM, PALETA, AVISOS E MODAIS
   ----------------------------------------------------------------------------------
   Peças pequenas usadas por todo o resto da interface. Nenhuma regra de negócio
   aqui — só o encanamento entre o JavaScript e a página.
   ================================================================================== */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Lê um token de cor do CSS — assim gráfico e interface nunca divergem de tema. */
function token(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function palette() {
  return {
    s: [token('--s1'), token('--s2'), token('--s3'), token('--s4'), token('--s5'), token('--s6')],
    ok: token('--ok'), warn: token('--warn'), danger: token('--danger'),
    text1: token('--text-1'), text2: token('--text-2'), text3: token('--text-3'),
    grid: token('--grid'), axis: token('--axis'),
    surface: token('--surface'), surface2: token('--surface-2'), surface3: token('--surface-3'),
    border: token('--border'), bg: token('--bg'),
    a1: token('--accent-1'), a2: token('--accent-2'), a3: token('--accent-3'),
  };
}

function toast(msg, kind = 'ok') {
  const colors = { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--danger)', info: 'var(--accent-2)' };
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${colors[kind]};margin-top:5px;flex:none"></span><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, 3200);
}

/**
 * Estado vazio. O terceiro argumento vira um botão que já abre o formulário certo —
 * é o que evita o usuário ficar procurando onde se lança uma despesa.
 */
function emptyState(title, desc, cta) {
  const botao = cta
    ? `<button class="btn btn-primary mt-1.5" data-add="${cta.kind}">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
         ${esc(cta.label)}</button>` : '';
  return `<div class="empty">
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M8 15h3"/></svg>
    <span class="empty-t">${esc(title)}</span><span class="empty-d">${esc(desc)}</span>${botao}</div>`;
}


/* ==================================================================================
   6b. SELECT CUSTOMIZADO
   ----------------------------------------------------------------------------------
   O <select> nativo continua na página — é ele que guarda o valor, entra no
   FormData e recebe os eventos `change` que o resto do código escuta. O que muda é
   só a aparência: o elemento fica invisível e um botão + painel próprios assumem a
   interação, porque a listinha que o navegador abre é desenhada pelo sistema
   operacional e não aceita CSS (por isso saía branca no tema escuro).
   ================================================================================== */

const CHEVRON = '<svg class="sel-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const CHECK   = '<svg class="sel-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

/** Enriquece todos os selects ainda "crus" e sincroniza os já montados. */
function enhanceSelects(root = document) {
  $$('select.field', root).forEach(enhanceSelect);
}

function enhanceSelect(sel) {
  let wrap = sel.closest('.sel');

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'sel';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('sel-native');
    sel.setAttribute('tabindex', '-1');
    sel.setAttribute('aria-hidden', 'true');
    // largura declarada no próprio select passa para o invólucro
    if (sel.style.width) { wrap.style.width = sel.style.width; sel.style.width = ''; }

    const id = sel.id || ('sel-' + Math.random().toString(36).slice(2, 8));
    wrap.insertAdjacentHTML('beforeend',
      `<button type="button" class="field sel-btn" aria-haspopup="listbox" aria-expanded="false"
               aria-controls="${id}-panel"><span class="sel-label"></span>${CHEVRON}</button>
       <div class="sel-panel" id="${id}-panel" role="listbox"></div>`);
    wireSelect(wrap, sel);
  }

  // Não reconstrói com o painel aberto — o usuário está no meio da escolha.
  if (!wrap.classList.contains('open')) buildSelectPanel(wrap, sel);
  syncSelectLabel(wrap, sel);
}

/** Redesenha as opções do painel a partir do <select> nativo (inclui optgroups). */
function buildSelectPanel(wrap, sel) {
  const panel = $('.sel-panel', wrap);
  const opt = o => `<div class="sel-opt" role="option" data-value="${esc(o.value)}"
      aria-selected="${o.value === sel.value}"><span>${esc(o.textContent)}</span>${CHECK}</div>`;
  panel.innerHTML = Array.from(sel.children).map(node =>
    node.tagName === 'OPTGROUP'
      ? `<div class="sel-group">${esc(node.label)}</div>` + Array.from(node.children).map(opt).join('')
      : opt(node)
  ).join('');
}

/** Espelha no botão o rótulo da opção atualmente selecionada. */
function syncSelectLabel(wrap, sel) {
  const chosen = sel.selectedOptions[0];
  $('.sel-label', wrap).textContent = chosen ? chosen.textContent : '';
  $$('.sel-opt', wrap).forEach(o => o.setAttribute('aria-selected', String(o.dataset.value === sel.value)));
}

function openSelect(wrap) {
  closeAllSelects(wrap);
  const btn = $('.sel-btn', wrap), panel = $('.sel-panel', wrap);
  wrap.classList.add('open');
  btn.setAttribute('aria-expanded', 'true');

  // Abre para cima quando não há espaço embaixo, e alinha à direita se fosse
  // vazar pela borda da tela.
  panel.classList.remove('up', 'right');
  const b = btn.getBoundingClientRect();
  if (window.innerHeight - b.bottom < Math.min(panel.scrollHeight + 20, 288)) panel.classList.add('up');
  if (panel.getBoundingClientRect().right > window.innerWidth - 8) panel.classList.add('right');

  const current = $('.sel-opt[aria-selected="true"]', wrap) || $('.sel-opt', wrap);
  setActiveOption(wrap, current, true);
}

function closeSelect(wrap) {
  wrap.classList.remove('open');
  $('.sel-btn', wrap).setAttribute('aria-expanded', 'false');
  $$('.sel-opt.active', wrap).forEach(o => o.classList.remove('active'));
}

function closeAllSelects(except) {
  $$('.sel.open').forEach(w => { if (w !== except) closeSelect(w); });
}

function setActiveOption(wrap, el, scroll) {
  if (!el) return;
  $$('.sel-opt.active', wrap).forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  if (scroll) el.scrollIntoView({ block: 'nearest' });
}

/** Aplica a escolha no <select> real e dispara `change` — o resto do app nem percebe. */
function commitSelect(wrap, sel, value) {
  const changed = sel.value !== value;
  sel.value = value;
  syncSelectLabel(wrap, sel);
  closeSelect(wrap);
  $('.sel-btn', wrap).focus();
  if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function wireSelect(wrap, sel) {
  const btn = $('.sel-btn', wrap), panel = $('.sel-panel', wrap);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    wrap.classList.contains('open') ? closeSelect(wrap) : openSelect(wrap);
  });

  panel.addEventListener('click', e => {
    const o = e.target.closest('.sel-opt');
    if (o) { e.stopPropagation(); commitSelect(wrap, sel, o.dataset.value); }
  });
  panel.addEventListener('mousemove', e => {
    const o = e.target.closest('.sel-opt');
    if (o) setActiveOption(wrap, o, false);
  });

  // Teclado: setas, Home/End, Enter, Esc e busca por digitação.
  let typed = '', typedAt = 0;
  btn.addEventListener('keydown', e => {
    const opts = $$('.sel-opt', wrap);
    const open = wrap.classList.contains('open');
    const idx = opts.indexOf($('.sel-opt.active', wrap));

    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); return openSelect(wrap); }
    if (!open) return;

    if (e.key === 'Escape') { e.preventDefault(); return closeSelect(wrap); }
    if (e.key === 'Tab') return closeSelect(wrap);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const a = $('.sel-opt.active', wrap);
      return a && commitSelect(wrap, sel, a.dataset.value);
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); return setActiveOption(wrap, opts[Math.min(opts.length - 1, idx + 1)], true); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); return setActiveOption(wrap, opts[Math.max(0, idx - 1)], true); }
    if (e.key === 'Home')      { e.preventDefault(); return setActiveOption(wrap, opts[0], true); }
    if (e.key === 'End')       { e.preventDefault(); return setActiveOption(wrap, opts[opts.length - 1], true); }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typed = (now - typedAt < 900 ? typed : '') + e.key.toLowerCase();
      typedAt = now;
      const hit = opts.find(o => o.textContent.trim().toLowerCase().startsWith(typed));
      if (hit) setActiveOption(wrap, hit, true);
    }
  });

  // Se outra parte do código mudar o valor e disparar `change`, o rótulo acompanha.
  sel.addEventListener('change', () => syncSelectLabel(wrap, sel));
}

document.addEventListener('click', () => closeAllSelects());
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllSelects(); });
window.addEventListener('resize', () => closeAllSelects());

/* ---- Modais --------------------------------------------------------------------- */

function openModal(id) { $(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { $(id).classList.remove('open'); document.body.style.overflow = ''; }
