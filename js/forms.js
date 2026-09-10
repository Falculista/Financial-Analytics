/* ==================================================================================
   13. FORMULÁRIO DE LANÇAMENTO
   ================================================================================== */

const KIND_ICONS = {
  plus:  '<path d="M12 5v14M5 12h14"/>',
  card:  '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bus:   '<rect x="4" y="4" width="16" height="12" rx="3"/><path d="M4 11h16M7 20v-2M17 20v-2"/>',
  minus: '<path d="M5 12h14"/>',
  hand:  '<path d="M12 3v9"/><path d="M8 21h8a4 4 0 0 0 4-4v-5"/><path d="M4 12v5a4 4 0 0 0 4 4"/>',
};

function renderKindPicker() {
  $('#kindPicker').innerHTML = Object.entries(KINDS).map(([k, v]) => {
    const on = State.formKind === k;
    return `<button type="button" data-kind="${k}"
      class="text-left rounded-xl px-3 py-2.5 border transition"
      style="background:${on ? 'color-mix(in srgb,var(--accent-1) 15%,transparent)' : 'var(--surface-2)'};
             border-color:${on ? 'color-mix(in srgb,var(--accent-1) 42%,transparent)' : 'var(--border)'}">
      <span class="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             style="color:${on ? 'var(--accent-1)' : 'var(--text-3)'}">${KIND_ICONS[v.icon]}</svg>
        <span class="text-[12.5px] font-semibold">${v.label}</span>
      </span>
      <span class="block text-[10.5px] mt-0.5" style="color:var(--text-3)">${v.desc}</span>
    </button>`;
  }).join('');
}

function field(name, label, input, full = false) {
  return `<div class="${full ? 'sm:col-span-2' : ''}"><label class="fl" for="f_${name}">${label}</label>${input}</div>`;
}
function inputEl(name, type, value, attrs = '') {
  return `<input id="f_${name}" name="${name}" class="field" type="${type}" value="${value ?? ''}" ${attrs}>`;
}
/** `options` aceita strings ou pares [valor, rótulo] — útil quando o valor gravado
 *  é minúsculo (`pago`) mas o texto na tela deve aparecer capitalizado (`Pago`). */
function selectEl(name, options, value) {
  return `<select id="f_${name}" name="${name}" class="field">${options.map(o => {
    const [v, label] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('')}</select>`;
}

function renderTxFields(tx) {
  const k = State.formKind;
  const st = Repo.settings();
  const t = tx || {};
  const parts = [];

  if (k === 'hora_extra' || k === 'liberamento') {
    const h = t.horas ?? '';
    parts.push(field('data', 'Data', inputEl('data', 'date', t.data || todayISO(), 'required')));
    parts.push(field('horas', 'Quantidade de horas', inputEl('horas', 'number', h, 'step="0.25" min="0" required placeholder="Ex.: 4"')));
    parts.push(field('descricao', 'Descrição', inputEl('descricao', 'text', t.descricao || '',
      `placeholder="${k === 'hora_extra' ? 'Ex.: Sábado — inventário' : 'Ex.: Liberado 2h mais cedo'}"`), true));
    parts.push(`<div class="sm:col-span-2 rounded-xl px-3.5 py-3" style="background:var(--surface-2);border:1px solid var(--border)">
      <span class="label">Valor calculado</span>
      <p class="text-[19px] font-semibold mt-1" id="calcPreview" style="color:${k === 'hora_extra' ? 'var(--ok)' : 'var(--danger)'}">${money(num(h) * num(st.valorHoraExtra))}</p>
      <p class="text-[11px] mt-1" style="color:var(--text-3)">horas × ${money(st.valorHoraExtra)} (valor da hora nas Configurações)${k === 'liberamento' ? ' — abatido da receita do mês' : ''}</p>
    </div>`);
  } else if (k === 'a_receber') {
    parts.push(field('descricao', 'Descrição', inputEl('descricao', 'text', t.descricao || '', 'required placeholder="Ex.: Horas extras de agosto"'), true));
    parts.push(field('categoria', 'Referente a', selectEl('categoria', RECV_KINDS, t.categoria || RECV_KINDS[0])));
    parts.push(field('valor', 'Valor (R$)', inputEl('valor', 'number', t.valor ?? '', 'step="0.01" min="0" required')));
    parts.push(field('dataPrevista', 'Data prevista de pagamento', inputEl('dataPrevista', 'date', t.dataPrevista || t.data || todayISO(), 'required')));
    parts.push(field('status', 'Situação', selectEl('status', [['pendente', 'Pendente'], ['pago', 'Pago']], t.status || 'pendente')));
    parts.push(field('dataPagamento', 'Data real do pagamento', inputEl('dataPagamento', 'date', t.dataPagamento || ''), true));
  } else if (k === 'vt') {
    parts.push(field('data', 'Data', inputEl('data', 'date', t.data || todayISO(), 'required')));
    parts.push(field('valor', 'Valor do ajuste (R$)', inputEl('valor', 'number', t.valor ?? '', 'step="0.01" required placeholder="Use negativo para descontar"')));
    parts.push(field('descricao', 'Descrição', inputEl('descricao', 'text', t.descricao || '', 'placeholder="Ex.: 5ª semana do mês"'), true));
    parts.push(`<p class="sm:col-span-2 text-[11.5px]" style="color:var(--text-3)">
      O VT base (${Calc.vtWeeks(State.key, st)} semanas × ${money(st.vtSemanal)}) já entra automaticamente na receita do mês.
      Use este lançamento apenas para ajustes pontuais.</p>`);
  } else {
    const cats = k === 'despesa' ? EXPENSE_CATS : REVENUE_CATS;
    parts.push(field('data', 'Data', inputEl('data', 'date', t.data || todayISO(), 'required')));
    parts.push(field('valor', 'Valor (R$)', inputEl('valor', 'number', t.valor ?? '', 'step="0.01" min="0" required')));
    parts.push(field('descricao', 'Descrição', inputEl('descricao', 'text', t.descricao || '', 'required placeholder="Ex.: Mercado do mês"'), true));
    parts.push(field('categoria', 'Categoria', selectEl('categoria', cats, t.categoria || cats[0])));
    parts.push(field('status', 'Status', selectEl('status', [['pago', 'Pago'], ['pendente', 'Pendente']], t.status || 'pago')));
  }

  parts.push(field('observacao', 'Observação (opcional)',
    `<textarea id="f_observacao" name="observacao" class="field" rows="2">${esc(t.observacao || '')}</textarea>`, true));

  $('#txFields').innerHTML = parts.join('');
  enhanceSelects($('#txFields'));   // os selects do modal também usam o dropdown próprio

  // Prévia ao vivo do valor calculado por horas
  const hIn = $('#f_horas');
  if (hIn) hIn.addEventListener('input', () => {
    $('#calcPreview').textContent = money(num(hIn.value) * num(Repo.settings().valorHoraExtra));
  });
}

function openTxModal(tx) {
  State.editingId = tx?.id || null;
  // Ao editar, o tipo vem do lançamento; ao criar, mantém o tipo escolhido no botão.
  if (tx) State.formKind = tx.kind;
  $('#txModalTitle').textContent = tx ? 'Editar Lançamento' : 'Novo Lançamento';
  $('#txModalSub').textContent = tx ? 'Altere os campos e salve' : 'Escolha o tipo e preencha os campos';
  $('#txDelete').style.display = tx ? '' : 'none';
  $('#kindPicker').style.display = tx ? 'none' : '';
  renderKindPicker();
  renderTxFields(tx);
  openModal('#ovTx');
}

async function submitTx(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const tx = {
    id: State.editingId || undefined,
    kind: State.formKind,
    descricao: data.descricao || KINDS[State.formKind].label,
    categoria: data.categoria || (State.formKind === 'hora_extra' ? 'Hora Extra' : State.formKind === 'vt' ? 'Vale Transporte' : ''),
    valor: data.valor,
    horas: data.horas,
    data: data.data || data.dataPrevista || todayISO(),
    dataPrevista: data.dataPrevista || null,
    dataPagamento: data.dataPagamento || null,
    status: data.status || 'pago',
    observacao: data.observacao,
  };
  await Repo.save(tx);
  closeModal('#ovTx');
  toast(State.editingId ? 'Lançamento atualizado.' : 'Lançamento adicionado.');
  State.editingId = null;
  renderAll();
}

/* ==================================================================================
   14. CONFIGURAÇÕES
   ================================================================================== */

function openSettings() {
  const s = Repo.settings();
  const key = State.key;
  const ov = s.overrides?.[key] || {};
  $('#sSalary').value = s.salarioMensal;
  $('#sVt').value = s.vtSemanal;
  $('#sHour').value = s.valorHoraExtra;
  $('#sPayday').value = s.diaPagamento;
  $('#sWeeksMonth').textContent = monthLabelLong(key);
  $('#sWeeksAuto').textContent = Calc.weeksInMonth(State.year, State.month);
  $('#sWeeks').value = ov.semanasVt ?? '';
  $('#sSalaryOverride').value = ov.salario ?? '';
  openModal('#ovSettings');
}

async function submitSettings(e) {
  e.preventDefault();
  const s = Repo.settings();
  const overrides = { ...(s.overrides || {}) };
  const key = State.key;
  const w = $('#sWeeks').value, sal = $('#sSalaryOverride').value;
  if (w === '' && sal === '') delete overrides[key];
  else overrides[key] = { ...(w !== '' ? { semanasVt: num(w) } : {}), ...(sal !== '' ? { salario: num(sal) } : {}) };

  await Repo.saveSettings({
    salarioMensal: num($('#sSalary').value),
    vtSemanal: num($('#sVt').value),
    valorHoraExtra: num($('#sHour').value),
    diaPagamento: Math.min(31, Math.max(1, parseInt($('#sPayday').value) || 5)),
    overrides,
  });
  closeModal('#ovSettings');
  toast('Configurações salvas.');
  renderAll();
}

/* ==================================================================================
   15. EXPORTAR / IMPORTAR
   ================================================================================== */

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportJSON() {
  const payload = {
    app: 'financial-analytics',
    version: APP.version,
    exportedAt: new Date().toISOString(),
    userId: Repo.currentUserId(),
    settings: Repo.settings(),
    transactions: Repo.all(),
  };
  download(`backup-financeiro-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('Backup JSON exportado.');
}

function exportCSV() {
  const rows = filteredTransactions();
  if (!rows.length) return toast('Nenhum lançamento no filtro atual.', 'warn');
  const head = ['Data', 'Descricao', 'Tipo', 'Categoria', 'Horas', 'Valor', 'Status', 'Data prevista', 'Data pagamento', 'Observacao'];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = rows.map(t => [
    fmtDate(t.data), t.descricao, KINDS[t.kind]?.label || t.kind, t.categoria,
    t.horas ?? '', NUM2.format(num(t.valor)),
    t.kind === 'a_receber' ? Calc.receivableStatus(t) : (t.status || 'pago'),
    t.dataPrevista ? fmtDate(t.dataPrevista) : '', t.dataPagamento ? fmtDate(t.dataPagamento) : '', t.observacao,
  ].map(cell).join(';'));
  // BOM + ';' → o Excel em pt-BR abre com acentuação e colunas corretas
  download(`lancamentos-${State.key}.csv`, '﻿' + [head.map(cell).join(';'), ...body].join('\r\n'), 'text/csv;charset=utf-8');
  toast(`${rows.length} lançamento(s) exportado(s) em CSV.`);
}

async function importJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.transactions;
    if (!Array.isArray(list)) throw new Error('Formato inesperado: não encontrei a lista de lançamentos.');
    if (!confirm(`Importar ${list.length} lançamento(s)? Isso substitui os dados atuais deste navegador.`)) return;
    if (data.settings) await Repo.saveSettings(data.settings);
    await Repo.replaceAll(list);
    buildFilters();
    $('#fMonth').value = State.month; $('#fYear').value = State.year;
    renderAll();
    toast(`${list.length} lançamento(s) importado(s).`);
  } catch (err) {
    console.error(err);
    toast('Não consegui ler o arquivo: ' + err.message, 'err');
  }
}

/* ==================================================================================
   16. DADOS DE EXEMPLO (opcional — só entram se você clicar em Configurações)
   ================================================================================== */

async function loadDemo() {
  if (Repo.all().length && !confirm('Isso substitui os lançamentos atuais por dados de exemplo. Continuar?')) return;
  const list = [];
  const now = new Date();
  const rnd = (a, b) => Math.round((a + Math.random() * (b - a)) * 100) / 100;
  const push = o => list.push(Repo.normalize(o));

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const key = monthKeyOf(y, m);

    // despesas
    [['Alimentação', 380, 640], ['Transporte', 60, 180], ['Moradia', 620, 820], ['Lazer', 40, 260], ['Outros', 50, 220]]
      .forEach(([cat, a, b], j) => push({
        kind: 'despesa', categoria: cat, descricao: `${cat} — ${MONTHS_SHORT[m]}`,
        valor: rnd(a, b), data: `${key}-${pad(Math.min(last, 4 + j * 5))}`, status: 'pago',
      }));

    // horas extras nos sábados
    for (let day = 1; day <= last; day++) {
      const dt = new Date(y, m, day);
      if (dt.getDay() === 6 && Math.random() > 0.45) {
        push({ kind: 'hora_extra', horas: [3, 4, 5, 6][Math.floor(Math.random() * 4)],
               descricao: 'Sábado trabalhado', categoria: 'Hora Extra', data: `${key}-${pad(day)}`, status: 'pago' });
      }
    }
    // liberamento eventual
    if (Math.random() > 0.7) push({ kind: 'liberamento', horas: [1, 2, 3][Math.floor(Math.random() * 3)],
      descricao: 'Liberado mais cedo', data: `${key}-${pad(Math.min(last, 12))}`, status: 'pago' });

    // pendências do patrão nos meses mais recentes
    if (i <= 2 && Math.random() > 0.35) {
      const prevista = `${key}-${pad(Math.min(last, 20))}`;
      const pago = i >= 2;
      push({ kind: 'a_receber', descricao: `Horas extras de ${MONTHS[m]}`, categoria: 'Hora extra',
             valor: rnd(60, 220), data: prevista, dataPrevista: prevista,
             status: pago ? 'pago' : 'pendente', dataPagamento: pago ? `${key}-${pad(Math.min(last, 26))}` : null });
    }
  }
  await Repo.replaceAll(list);
  await Repo.saveSettings({ salarioMensal: 2000, vtSemanal: 55, valorHoraExtra: 10, diaPagamento: 5 });
  closeModal('#ovSettings');
  buildFilters();
  $('#fMonth').value = State.month; $('#fYear').value = State.year;
  renderAll();
  toast('Dados de exemplo carregados. Use "Apagar todos os dados" quando quiser começar do zero.');
}

async function wipeAll() {
  if (!confirm('Apagar TODOS os lançamentos e voltar as configurações ao padrão? Esta ação não pode ser desfeita.')) return;
  await Repo.wipe();
  closeModal('#ovSettings');
  buildFilters();
  renderAll();
  toast('Todos os dados foram apagados.', 'warn');
}

/* ==================================================================================
   17. "COMO USAR"
   ================================================================================== */

const HELP_HTML = `
<div class="card-pad pt-0" style="color:var(--text-2);font-size:13px;line-height:1.65">
  <div class="divider mb-4"></div>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div>
      <h3 class="text-[13px] font-semibold mb-2" style="color:var(--text-1)">1. Comece pelas Configurações</h3>
      <p>Clique em <b>Configurações</b> e informe o <b>salário mensal</b>, o <b>VT por semana</b> (R$ 55,00),
         o <b>valor da hora extra</b> (R$ 10,00) e o <b>dia de pagamento</b>. Esses valores alimentam todos os cálculos.
         Se em algum mês o salário ou o número de semanas de VT for diferente, preencha os campos de exceção — eles
         valem só para o mês que estiver selecionado no filtro.</p>

      <h3 class="text-[13px] font-semibold mt-4 mb-2" style="color:var(--text-1)">2. Registre o dia a dia</h3>
      <p>Em <b>Novo Lançamento</b> você escolhe o tipo:</p>
      <ul class="mt-1.5 space-y-1 list-disc pl-4.5" style="padding-left:18px">
        <li><b>Despesa</b> — gasto por categoria (alimentação, transporte, moradia, lazer, outros).</li>
        <li><b>Hora extra</b> — informe as horas; o valor sai de <i>horas × valor/hora</i>.</li>
        <li><b>Liberamento</b> — horas que você não trabalhou; entram como desconto na receita do mês.</li>
        <li><b>Vale transporte</b> — só para ajustes; o VT base já é calculado sozinho.</li>
        <li><b>A receber</b> — o que o patrão ainda deve, com data prevista.</li>
        <li><b>Receita extra</b> — qualquer entrada fora do salário.</li>
      </ul>

      <h3 class="text-[13px] font-semibold mt-4 mb-2" style="color:var(--text-1)">3. Acompanhe o que o patrão deve</h3>
      <p>Toda pendência com <b>data prevista anterior a hoje</b> e ainda não paga vira <b>Atrasado</b> automaticamente,
         com a contagem de dias. Quando o pagamento cair, clique em <b>Quitar</b>.</p>
    </div>

    <div>
      <h3 class="text-[13px] font-semibold mb-2" style="color:var(--text-1)">4. Gerar o Relatório PDF</h3>
      <ol class="space-y-1.5" style="padding-left:18px;list-style:decimal">
        <li>Clique em <b>Gerar Relatório PDF</b> no topo.</li>
        <li>Escolha o <b>período</b> — use um atalho (Este mês, Mês passado, Últimos 3 meses, Este ano) ou marque
            <b>Personalizado</b> e informe as datas.</li>
        <li>Marque <b>o que incluir</b>: KPIs, gráficos, tabela de lançamentos, pendências do patrão e o
            detalhamento de horas extras / VT / liberamentos.</li>
        <li>Escreva uma <b>observação</b> (ela aparece na capa) e confira o <b>nome do arquivo</b>.</li>
        <li>Clique em <b>Gerar PDF</b>. O download começa em alguns segundos — o arquivo sai no mesmo visual
            do painel, com capa, cabeçalho, rodapé e numeração de páginas.</li>
      </ol>

      <h3 class="text-[13px] font-semibold mt-4 mb-2" style="color:var(--text-1)">5. Backup dos dados</h3>
      <p>Tudo fica salvo no <b>seu navegador</b> (localStorage) — nada é enviado para nenhum servidor.
         Por isso, exporte um <b>JSON</b> de vez em quando: é o backup completo e restaurável em
         <b>Exportar Dados → Importar JSON</b>. O <b>CSV</b> exporta os lançamentos do filtro atual, pronto para o Excel.</p>

      <h3 class="text-[13px] font-semibold mt-4 mb-2" style="color:var(--text-1)">Regras de cálculo</h3>
      <div class="rounded-xl p-3.5 mt-1" style="background:var(--surface-2);border:1px solid var(--border);font-size:12.5px">
        <p><b>Receita</b> = salário + VT + horas extras + receitas extras − liberamentos</p>
        <p class="mt-1"><b>VT</b> = semanas do mês × valor semanal <span style="color:var(--text-3)">(semanas = nº de segundas-feiras, ou o valor que você definir)</span></p>
        <p class="mt-1"><b>Hora extra</b> = horas × valor da hora</p>
        <p class="mt-1"><b>Saldo</b> = receita − despesas</p>
        <p class="mt-1"><b>Atrasado</b> = data prevista &lt; hoje <b>e</b> status ≠ pago</p>
      </div>
    </div>
  </div>
</div>`;

/* ==================================================================================
   18. EVENTOS
   ================================================================================== */

function wireEvents() {
  // Tema
  $('#btnTheme').addEventListener('click', async () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    await Repo.saveSettings({ theme: next });
    renderAll();
  });

  // Filtros
  $('#fMonth').addEventListener('change', e => { State.month = +e.target.value; State.page = 1; renderAll(); });
  $('#fYear').addEventListener('change', e => { State.year = +e.target.value; State.page = 1; renderAll(); });
  $('#fCat').addEventListener('change', e => { State.categoria = e.target.value; State.page = 1; renderTable(); });
  $('#fStatus').addEventListener('change', e => { State.status = e.target.value; State.page = 1; renderTable(); });
  $('#fType').addEventListener('change', e => { State.tipo = e.target.value; State.page = 1; renderTable(); });
  $('#btnClearFilters').addEventListener('click', () => {
    const now = new Date();
    Object.assign(State, { month: now.getMonth(), year: now.getFullYear(), categoria: '', status: '', tipo: '', search: '', page: 1 });
    $('#fMonth').value = State.month; $('#fYear').value = State.year;
    $('#fCat').value = ''; $('#fStatus').value = ''; $('#fType').value = ''; $('#txSearch').value = '';
    renderAll();
  });

  // Tabela
  $('#txSearch').addEventListener('input', e => { State.search = e.target.value; State.page = 1; renderTable(); });
  $('#txPerPage').addEventListener('change', e => { State.perPage = +e.target.value; State.page = 1; renderTable(); });
  $('#txPrev').addEventListener('click', () => { State.page--; renderTable(); });
  $('#txNext').addEventListener('click', () => { State.page++; renderTable(); });

  document.addEventListener('click', async e => {
    const edit = e.target.closest('[data-edit]');
    if (edit) { const t = Repo.all().find(x => x.id === edit.dataset.edit); if (t) openTxModal(t); return; }

    const del = e.target.closest('[data-del]');
    if (del) {
      const t = Repo.all().find(x => x.id === del.dataset.del);
      if (t && confirm(`Excluir "${t.descricao || KINDS[t.kind]?.label}" de ${fmtDate(t.data)}?`)) {
        await Repo.remove(t.id); renderAll(); toast('Lançamento excluído.', 'warn');
      }
      return;
    }

    const settle = e.target.closest('[data-settle]');
    if (settle) {
      const t = Repo.all().find(x => x.id === settle.dataset.settle);
      if (t) { await Repo.save({ ...t, status: 'pago', dataPagamento: todayISO() }); renderAll(); toast('Pendência quitada.'); }
      return;
    }

    const kindBtn = e.target.closest('[data-kind]');
    if (kindBtn) { State.formKind = kindBtn.dataset.kind; renderKindPicker(); renderTxFields(null); return; }

    if (e.target.closest('[data-close]')) { $$('.overlay.open').forEach(o => closeModal('#' + o.id)); return; }

    // Fecha o menu de exportação ao clicar fora
    if (!e.target.closest('#btnExport') && !e.target.closest('#menuExport')) $('#menuExport').classList.add('hidden');
  });

  $$('.overlay').forEach(o => o.addEventListener('mousedown', e => { if (e.target === o) closeModal('#' + o.id); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.overlay.open').forEach(o => closeModal('#' + o.id)); });

  // Abas do gráfico de evolução
  $('#evoTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    State.evoView = b.dataset.view; applyEvoView();
  });

  // Modais / ações do header
  $('#btnNew').addEventListener('click', () => { State.formKind = 'despesa'; openTxModal(null); });
  $('#btnNewReceivable').addEventListener('click', () => { State.formKind = 'a_receber'; openTxModal(null); });
  $('#btnSettings').addEventListener('click', openSettings);
  $('#txForm').addEventListener('submit', submitTx);
  $('#settingsForm').addEventListener('submit', submitSettings);
  $('#txDelete').addEventListener('click', async () => {
    if (State.editingId && confirm('Excluir este lançamento?')) {
      await Repo.remove(State.editingId); State.editingId = null;
      closeModal('#ovTx'); renderAll(); toast('Lançamento excluído.', 'warn');
    }
  });
  $('#btnDemo').addEventListener('click', loadDemo);
  $('#btnWipe').addEventListener('click', wipeAll);

  // Exportar / importar
  $('#btnExport').addEventListener('click', e => { e.stopPropagation(); $('#menuExport').classList.toggle('hidden'); });
  $('#menuExport').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    $('#menuExport').classList.add('hidden');
    if (b.dataset.act === 'json') exportJSON();
    if (b.dataset.act === 'csv') exportCSV();
    if (b.dataset.act === 'import') $('#importFile').click();
  });
  $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });

  // Como usar
  $('#helpToggle').addEventListener('click', () => {
    const body = $('#helpBody');
    const open = body.classList.toggle('hidden');
    $('#helpChevron').style.transform = open ? '' : 'rotate(180deg)';
  });

  // PDF
  $('#btnPdf').addEventListener('click', openPdfModal);
  $('#pdfForm').addEventListener('submit', generatePdf);
  $('#pdfPresets').addEventListener('click', e => {
    const b = e.target.closest('[data-preset]'); if (!b) return;
    applyPdfPreset(b.dataset.preset);
  });
}

/* ==================================================================================
   19. BOOTSTRAP
   ================================================================================== */

async function init() {
  await Repo.load();
  applyTheme(Repo.settings().theme || 'dark');
  buildFilters();
  $('#helpBody').innerHTML = HELP_HTML;
  wireEvents();
  renderAll();

  if (!Repo.all().length) {
    toast('Painel vazio. Comece em Configurações e depois use "Novo Lançamento".', 'info');
  }
}

// O boot espera o documento inteiro: as funções do relatório PDF são declaradas no
// bloco de script seguinte, e só existem depois que o HTML termina de ser lido.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
