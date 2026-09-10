/* ==================================================================================
   13. FORMULÁRIO DE LANÇAMENTO
   ----------------------------------------------------------------------------------
   Cada tipo de lançamento tem seu próprio botão na barra de ações, então o
   formulário já abre no tipo certo — não existe mais um seletor de tipo escondido
   dentro do modal.
   ================================================================================== */

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
    // O valor da hora vive no próprio lançamento e vem pré-preenchido com o último
    // usado: reajuste futuro não reescreve o histórico já registrado.
    const vh = t.valorHora ?? st.ultimoValorHora ?? 10;
    parts.push(field('data', 'Data', inputEl('data', 'date', t.data || todayISO(), 'required')));
    parts.push(field('horas', 'Quantidade de horas', inputEl('horas', 'number', h, 'step="0.25" min="0" required placeholder="Ex.: 4"')));
    parts.push(field('valorHora', 'Valor da hora (R$)', inputEl('valorHora', 'number', vh, 'step="0.01" min="0" required')));
    parts.push(field('descricao', 'Descrição', inputEl('descricao', 'text', t.descricao || '',
      `placeholder="${k === 'hora_extra' ? 'Ex.: Sábado — inventário' : 'Ex.: Liberado 2h mais cedo'}"`)));
    parts.push(`<div class="sm:col-span-2 rounded-xl px-3.5 py-3" style="background:var(--surface-2);border:1px solid var(--border)">
      <span class="label">Valor calculado</span>
      <p class="text-[19px] font-semibold mt-1" id="calcPreview" style="color:${k === 'hora_extra' ? 'var(--ok)' : 'var(--danger)'}">${money(num(h) * num(vh))}</p>
      <p class="text-[11px] mt-1" style="color:var(--text-3)">horas × valor da hora${k === 'liberamento' ? ' — abatido da receita do mês' : ''}</p>
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
    parts.push(field('descricao', 'Descrição', inputEl('descricao', 'text', t.descricao || '', 'placeholder="Ex.: semana sem VT por falta"'), true));
    parts.push(`<p class="sm:col-span-2 text-[11.5px]" style="color:var(--text-3)">
      Os benefícios cadastrados em <b>Salário e Benefícios</b> já entram sozinhos na receita do mês.
      Use este lançamento apenas para corrigir um mês em que o valor veio diferente.</p>`);

  } else if (k === 'receita') {
    parts.push(field('data', 'Data', inputEl('data', 'date', t.data || todayISO(), 'required')));
    parts.push(field('valor', 'Valor (R$)', inputEl('valor', 'number', t.valor ?? '', 'step="0.01" min="0" required')));
    parts.push(field('descricao', 'Descrição', inputEl('descricao', 'text', t.descricao || '', 'required placeholder="Ex.: venda de um freela"'), true));
    parts.push(field('categoria', 'Categoria', selectEl('categoria', EXTRA_REVENUE_CATS, t.categoria || EXTRA_REVENUE_CATS[0])));
    parts.push(field('status', 'Status', selectEl('status', [['pago', 'Recebido'], ['pendente', 'A receber']], t.status || 'pago')));

  } else {   // despesa
    parts.push(field('data', 'Data', inputEl('data', 'date', t.data || todayISO(), 'required')));
    parts.push(field('valor', 'Valor (R$)', inputEl('valor', 'number', t.valor ?? '', 'step="0.01" min="0" required')));
    parts.push(field('descricao', 'Descrição', inputEl('descricao', 'text', t.descricao || '', 'required placeholder="Ex.: Mercado do mês"'), true));
    parts.push(field('categoria', 'Categoria', selectEl('categoria', EXPENSE_CATS, t.categoria || EXPENSE_CATS[0])));
    parts.push(field('status', 'Status', selectEl('status', [['pago', 'Pago'], ['pendente', 'Pendente']], t.status || 'pago')));
  }

  parts.push(field('observacao', 'Observação (opcional)',
    `<textarea id="f_observacao" name="observacao" class="field" rows="2">${esc(t.observacao || '')}</textarea>`, true));

  $('#txFields').innerHTML = parts.join('');
  enhanceSelects($('#txFields'));   // os selects do modal também usam o dropdown próprio

  // Prévia ao vivo do valor calculado por horas
  const hIn = $('#f_horas'), vIn = $('#f_valorHora');
  const sync = () => { $('#calcPreview').textContent = money(num(hIn.value) * num(vIn.value)); };
  if (hIn && vIn) { hIn.addEventListener('input', sync); vIn.addEventListener('input', sync); }
}

function openTxModal(kind, tx) {
  State.editingId = tx?.id || null;
  State.formKind = tx ? tx.kind : (kind || 'despesa');
  const k = KINDS[State.formKind];
  // "Nova despesa", "Novo liberamento" — concorda com o gênero do tipo.
  const feminino = ['despesa', 'receita', 'hora_extra'].includes(State.formKind);
  $('#txModalTitle').textContent = tx
    ? `Editar ${k.label.toLowerCase()}`
    : `${feminino ? 'Nova' : 'Novo'} ${k.label.toLowerCase()}`;
  $('#txModalSub').textContent = k.desc;
  $('#txDelete').style.display = tx ? '' : 'none';
  renderTxFields(tx);
  openModal('#ovTx');
  setTimeout(() => { const f = $('#txFields input:not([type=date])'); if (f) f.focus(); }, 60);
}

async function submitTx(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const tx = {
    id: State.editingId || undefined,
    kind: State.formKind,
    descricao: data.descricao || KINDS[State.formKind].label,
    categoria: data.categoria || (State.formKind === 'hora_extra' ? 'Hora Extra'
              : State.formKind === 'vt' ? 'Benefícios' : ''),
    valor: data.valor,
    horas: data.horas,
    valorHora: data.valorHora,
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
  buildFilters();
  renderAll();
}

/* ==================================================================================
   14. SALÁRIO E BENEFÍCIOS
   ----------------------------------------------------------------------------------
   Cada período guarda o salário e os benefícios que valiam naquela época. Um período
   sem data final é o atual ("até o momento"). Como o cálculo lê o período pela data,
   o histórico continua correto quando você registra um aumento: os meses antigos
   seguem com os valores antigos.
   ================================================================================== */

function openSalaryList() {
  renderSalaryList();
  openModal('#ovSalary');
}

function renderSalaryList() {
  const list = Repo.salaries();
  if (!list.length) {
    $('#salaryList').innerHTML = emptyState('Nenhum salário cadastrado',
      'Cadastre o valor e a data em que passou a recebê-lo. Meses anteriores a essa data ficam sem salário — é assim que o painel evita inventar receita que você não teve.');
    return;
  }
  $('#salaryList').innerHTML = list.map(s => {
    const atual = !s.fim;
    const beneficios = (s.beneficios || []).map(b =>
      `<span class="chip">${esc(b.nome)} <b>${money(b.valor)}</b>${freqLabel(b.frequencia)}</span>`).join('');
    return `<div class="sal-card ${atual ? 'atual' : ''}">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p class="text-[20px] font-semibold" style="letter-spacing:-.02em">${money(s.valor)}<span class="text-[12px] font-normal" style="color:var(--text-3)"> /mês</span></p>
          <p class="text-[12px] mt-0.5" style="color:var(--text-2)">
            De <b style="color:var(--text-1)">${fmtDate(s.inicio)}</b>
            ${atual ? '<span style="color:var(--ok);font-weight:600"> até o momento</span>'
                    : ` até <b style="color:var(--text-1)">${fmtDate(s.fim)}</b>`}
          </p>
          ${s.observacao ? `<p class="text-[11.5px] mt-1" style="color:var(--text-3)">${esc(s.observacao)}</p>` : ''}
        </div>
        <div class="flex gap-1">
          <button class="btn btn-icon btn-ghost" data-sal-edit="${s.id}" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="btn btn-icon btn-ghost" data-sal-del="${s.id}" title="Excluir" style="color:var(--danger)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>
      </div>
      ${beneficios ? `<div class="flex flex-wrap gap-1.5 mt-2.5">${beneficios}</div>`
                   : `<p class="text-[11.5px] mt-2.5" style="color:var(--text-3)">Sem benefícios cadastrados neste período</p>`}
    </div>`;
  }).join('');
}

/* ---- Formulário de um período ---------------------------------------------------- */

function benefitRow(b = {}) {
  const nomes = BENEFIT_PRESETS.map(p => p.nome);
  const custom = b.nome && !nomes.includes(b.nome);
  return `<div class="benefit-row">
    <div class="benefit-name">
      <label class="fl">Benefício</label>
      <select class="field ben-nome">
        ${nomes.map(n => `<option value="${esc(n)}" ${n === b.nome ? 'selected' : ''}>${esc(n)}</option>`).join('')}
        <option value="__outro" ${custom ? 'selected' : ''}>Outro (digitar)</option>
      </select>
      <input class="field ben-custom mt-1.5 ${custom ? '' : 'hidden'}" type="text"
             placeholder="Nome do benefício" value="${custom ? esc(b.nome) : ''}">
    </div>
    <div><label class="fl">Valor (R$)</label><input class="field ben-valor" type="number" step="0.01" min="0" value="${b.valor ?? ''}" placeholder="0,00"></div>
    <div><label class="fl">Frequência</label>
      <select class="field ben-freq">
        ${FREQUENCIES.map(f => `<option value="${f.id}" ${f.id === b.frequencia ? 'selected' : ''}>${f.label}</option>`).join('')}
      </select>
    </div>
    <button type="button" class="btn btn-icon btn-ghost ben-del" title="Remover benefício" style="color:var(--danger)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
    </button>
  </div>`;
}

function addBenefitRow(b) {
  $('#benefitList').insertAdjacentHTML('beforeend', benefitRow(b));
  const row = $('#benefitList').lastElementChild;
  enhanceSelects(row);
  // Ao escolher um preset, a frequência típica dele já vem sugerida.
  $('.ben-nome', row).addEventListener('change', e => {
    const outro = e.target.value === '__outro';
    $('.ben-custom', row).classList.toggle('hidden', !outro);
    if (outro) { $('.ben-custom', row).focus(); return; }
    const preset = BENEFIT_PRESETS.find(p => p.nome === e.target.value);
    if (preset) {
      const freq = $('.ben-freq', row);
      freq.value = preset.frequencia;
      freq.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  $('.ben-del', row).addEventListener('click', () => row.remove());
  return row;
}

function collectBenefits() {
  return $$('#benefitList .benefit-row').map(row => {
    const sel = $('.ben-nome', row).value;
    const nome = sel === '__outro' ? $('.ben-custom', row).value.trim() : sel;
    return { nome, valor: num($('.ben-valor', row).value), frequencia: $('.ben-freq', row).value };
  }).filter(b => b.nome && b.valor > 0);
}

function openSalaryForm(sal) {
  State.editingSalaryId = sal?.id || null;
  $('#salaryFormTitle').textContent = sal ? 'Editar período de salário' : 'Novo período de salário';
  $('#salDelete').style.display = sal ? '' : 'none';
  $('#salValor').value = sal?.valor ?? '';
  $('#salInicio').value = sal?.inicio || isoOf(new Date(State.year, State.isYear ? 0 : State.period, 1));
  $('#salFim').value = sal?.fim || '';
  $('#salObs').value = sal?.observacao || '';
  $('#salAtual').checked = !sal?.fim;
  $('#salFim').disabled = $('#salAtual').checked;
  $('#salWarn').classList.add('hidden');

  $('#benefitList').innerHTML = '';
  if (sal?.beneficios?.length) sal.beneficios.forEach(b => addBenefitRow(b));
  else if (!sal) addBenefitRow({ nome: 'Vale Transporte', valor: '', frequencia: 'semana' });

  closeModal('#ovSalary');
  openModal('#ovSalaryForm');
  setTimeout(() => $('#salValor').focus(), 60);
}

/** Avisa quando o novo período pisa em cima de outro já cadastrado. */
function salaryOverlapWarning(candidate) {
  const fim = candidate.fim || '9999-12-31';
  const conflitos = Repo.salaries().filter(s => s.id !== candidate.id)
    .filter(s => candidate.inicio <= (s.fim || '9999-12-31') && (s.inicio <= fim));
  if (!conflitos.length) return null;
  return `Este período se sobrepõe a ${conflitos.length} já cadastrado(s): `
    + conflitos.map(s => `${fmtDate(s.inicio)}–${s.fim ? fmtDate(s.fim) : 'atual'}`).join(', ')
    + '. Nos meses em comum os dois salários serão somados — se foi um reajuste, coloque uma data final no período antigo.';
}

async function submitSalary(e) {
  e.preventDefault();
  const atual = $('#salAtual').checked;
  const cand = {
    id: State.editingSalaryId || undefined,
    valor: num($('#salValor').value),
    inicio: $('#salInicio').value,
    fim: atual ? null : ($('#salFim').value || null),
    beneficios: collectBenefits(),
    observacao: $('#salObs').value,
  };
  if (!atual && cand.fim && cand.fim < cand.inicio) {
    return toast('A data final precisa ser posterior à data de início.', 'err');
  }

  const aviso = salaryOverlapWarning(cand);
  if (aviso && !$('#salWarn').dataset.ack) {
    // Primeiro clique só avisa; o segundo confirma. Sobreposição às vezes é proposital.
    $('#salWarn').textContent = aviso + ' Clique em "Salvar período" de novo para confirmar mesmo assim.';
    $('#salWarn').classList.remove('hidden');
    $('#salWarn').dataset.ack = '1';
    return;
  }

  await Repo.saveSalary(cand);
  delete $('#salWarn').dataset.ack;
  State.editingSalaryId = null;
  closeModal('#ovSalaryForm');
  toast('Período salvo.');
  buildFilters();
  renderAll();
  openSalaryList();
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
    salaries: Repo.salaries(),
    transactions: Repo.all(),
  };
  download(`backup-financeiro-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('Backup JSON exportado.');
}

function exportCSV() {
  const rows = filteredTransactions();
  if (!rows.length) return toast('Nenhum lançamento no filtro atual.', 'warn');
  const head = ['Data', 'Descricao', 'Tipo', 'Categoria', 'Horas', 'Valor hora', 'Valor', 'Status', 'Data prevista', 'Data pagamento', 'Observacao'];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = rows.map(t => [
    fmtDate(t.data), t.descricao, KINDS[t.kind]?.label || t.kind, t.categoria,
    t.horas ?? '', t.valorHora ? NUM2.format(t.valorHora) : '', NUM2.format(num(t.valor)),
    t.kind === 'a_receber' ? Calc.receivableStatus(t) : (t.status || 'pago'),
    t.dataPrevista ? fmtDate(t.dataPrevista) : '', t.dataPagamento ? fmtDate(t.dataPagamento) : '', t.observacao,
  ].map(cell).join(';'));
  // BOM + ';' → o Excel em pt-BR abre com acentuação e colunas corretas
  download(`lancamentos-${State.isYear ? State.year : State.key}.csv`,
    '﻿' + [head.map(cell).join(';'), ...body].join('\r\n'), 'text/csv;charset=utf-8');
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
    await Repo.replaceSalaries(data.salaries || []);
    await Repo.replaceAll(list);
    await Repo.migrate();
    buildFilters();
    renderAll();
    toast(`${list.length} lançamento(s) importado(s).`);
  } catch (err) {
    console.error(err);
    toast('Não consegui ler o arquivo: ' + err.message, 'err');
  }
}

/* ==================================================================================
   16. DADOS DE EXEMPLO (opcional — só entram se você pedir no menu "Dados")
   ================================================================================== */

async function loadDemo() {
  if ((Repo.all().length || Repo.salaries().length)
      && !confirm('Isso substitui os dados atuais por um exemplo fictício. Continuar?')) return;
  const list = [];
  const now = new Date();
  const rnd = (a, b) => Math.round((a + Math.random() * (b - a)) * 100) / 100;
  const push = o => list.push(Repo.normalize(o));

  // Dois períodos de salário para o exemplo mostrar um reajuste no meio do caminho.
  const inicio = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const reajuste = new Date(now.getFullYear(), now.getMonth() - 4, 1);
  const beneficios = [
    { nome: 'Vale Transporte', valor: 55, frequencia: 'semana' },
    { nome: 'Vale Refeição', valor: 22, frequencia: 'dia_util' },
  ];
  await Repo.replaceSalaries([
    { valor: 2000, inicio: isoOf(inicio), fim: isoOf(new Date(reajuste.getFullYear(), reajuste.getMonth(), 0)),
      beneficios, observacao: 'Contratação' },
    { valor: 2300, inicio: isoOf(reajuste), fim: null,
      beneficios: [...beneficios, { nome: 'Gratificação', valor: 150, frequencia: 'mes' }],
      observacao: 'Reajuste anual' },
  ]);

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const key = monthKeyOf(y, m);

    [['Alimentação', 380, 640], ['Transporte', 60, 180], ['Moradia', 620, 820], ['Lazer', 40, 260], ['Outros', 50, 220]]
      .forEach(([cat, a, b], j) => push({
        kind: 'despesa', categoria: cat, descricao: `${cat} — ${MONTHS_SHORT[m]}`,
        valor: rnd(a, b), data: `${key}-${pad(Math.min(last, 4 + j * 5))}`, status: 'pago',
      }));

    for (let day = 1; day <= last; day++) {
      const dt = new Date(y, m, day);
      if (dt.getDay() === 6 && Math.random() > 0.45) {
        push({ kind: 'hora_extra', horas: [3, 4, 5, 6][Math.floor(Math.random() * 4)], valorHora: 10,
               descricao: 'Sábado trabalhado', categoria: 'Hora Extra', data: `${key}-${pad(day)}`, status: 'pago' });
      }
    }
    if (Math.random() > 0.7) push({ kind: 'liberamento', horas: [1, 2, 3][Math.floor(Math.random() * 3)], valorHora: 10,
      descricao: 'Liberado mais cedo', data: `${key}-${pad(Math.min(last, 12))}`, status: 'pago' });

    if (i <= 2 && Math.random() > 0.35) {
      const prevista = `${key}-${pad(Math.min(last, 20))}`;
      const pago = i >= 2;
      push({ kind: 'a_receber', descricao: `Horas extras de ${MONTHS[m]}`, categoria: 'Hora extra',
             valor: rnd(60, 220), data: prevista, dataPrevista: prevista,
             status: pago ? 'pago' : 'pendente', dataPagamento: pago ? `${key}-${pad(Math.min(last, 26))}` : null });
    }
  }
  await Repo.replaceAll(list);
  buildFilters();
  renderAll();
  toast('Dados de exemplo carregados. Use "Apagar todos os dados" quando quiser começar do zero.');
}

async function wipeAll() {
  if (!confirm('Apagar TODOS os lançamentos e períodos de salário? Esta ação não pode ser desfeita.')) return;
  await Repo.wipe();
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
      <h3 class="text-[13px] font-semibold mb-2" style="color:var(--text-1)">1. Cadastre seu salário</h3>
      <p>Clique em <b>Salário e Benefícios</b>, no topo. Informe o valor, a data em que
         <b>passou a receber</b> esse valor e marque <b>"Recebo este valor até o momento"</b>.
         Meses anteriores a essa data ficam sem salário — o painel não inventa receita que você não teve.</p>
      <p class="mt-2">Quando houver aumento, <b>não edite o valor antigo</b>: coloque uma data final no
         período que acabou e crie um novo período. Assim o histórico continua calculado
         com os valores da época.</p>

      <h3 class="text-[13px] font-semibold mt-4 mb-2" style="color:var(--text-1)">2. Adicione os benefícios</h3>
      <p>No mesmo formulário, cada benefício tem um valor e uma <b>frequência</b>:</p>
      <ul class="mt-1.5 space-y-1" style="padding-left:18px;list-style:disc">
        <li><b>Por semana</b> — o VT, por exemplo. O painel conta as semanas de trabalho do mês.</li>
        <li><b>Por dia útil</b> — típico do vale refeição: conta os dias de segunda a sexta.</li>
        <li><b>Por mês</b> — valor fixo, como gratificação ou auxílio.</li>
      </ul>

      <h3 class="text-[13px] font-semibold mt-4 mb-2" style="color:var(--text-1)">3. Lance o dia a dia</h3>
      <p>Os botões ficam logo abaixo do cabeçalho, cada um escrito:</p>
      <ul class="mt-1.5 space-y-1" style="padding-left:18px;list-style:disc">
        <li><b>Despesa</b> — gasto por categoria.</li>
        <li><b>Hora extra</b> — informe as horas e o valor da hora; o total sai sozinho.</li>
        <li><b>Liberamento</b> — horas não trabalhadas, descontadas da receita do mês.</li>
        <li><b>Receita extra</b> — qualquer entrada fora do salário.</li>
        <li><b>A receber do patrão</b> — o que ainda está devendo, com data prevista.</li>
      </ul>
    </div>

    <div>
      <h3 class="text-[13px] font-semibold mb-2" style="color:var(--text-1)">4. Escolha o período</h3>
      <p>No filtro <b>Período</b> você alterna entre um mês específico e <b>O ano todo</b>.
         KPIs, gráficos, análises e tabela acompanham a escolha. No ano todo, o gráfico de
         horas extras passa a mostrar uma barra por mês.</p>

      <h3 class="text-[13px] font-semibold mt-4 mb-2" style="color:var(--text-1)">5. Gere o relatório PDF</h3>
      <ol class="space-y-1.5" style="padding-left:18px;list-style:decimal">
        <li>Clique em <b>Relatório PDF</b> no topo.</li>
        <li>Escolha o período — atalhos ou datas personalizadas.</li>
        <li>Marque o que incluir: KPIs, gráficos, tabela, pendências e o detalhamento.</li>
        <li>Escreva uma observação (aparece na capa) e confira o nome do arquivo.</li>
        <li><b>Gerar PDF</b> — o download começa em alguns segundos.</li>
      </ol>

      <h3 class="text-[13px] font-semibold mt-4 mb-2" style="color:var(--text-1)">6. Faça backup</h3>
      <p>Tudo fica salvo no <b>seu navegador</b> — nada é enviado para servidor nenhum.
         Por isso exporte um <b>JSON</b> de vez em quando, em <b>Dados → Exportar JSON</b>.
         É o backup completo e restaurável.</p>

      <h3 class="text-[13px] font-semibold mt-4 mb-2" style="color:var(--text-1)">Regras de cálculo</h3>
      <div class="rounded-xl p-3.5 mt-1" style="background:var(--surface-2);border:1px solid var(--border);font-size:12.5px">
        <p><b>Receita</b> = salário + benefícios + horas extras + receitas extras − liberamentos</p>
        <p class="mt-1"><b>Mês parcial</b>: começou dia 15? O salário do mês entra proporcional aos dias.</p>
        <p class="mt-1"><b>Benefício semanal</b> = valor × semanas de trabalho no período</p>
        <p class="mt-1"><b>Hora extra</b> = horas × valor da hora daquele lançamento</p>
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
  $('#fPeriod').addEventListener('change', e => {
    State.period = e.target.value === 'year' ? 'year' : +e.target.value;
    State.page = 1; renderAll();
  });
  $('#fYear').addEventListener('change', e => { State.year = +e.target.value; State.page = 1; renderAll(); });
  $('#fCat').addEventListener('change', e => { State.categoria = e.target.value; State.page = 1; renderTable(); });
  $('#fStatus').addEventListener('change', e => { State.status = e.target.value; State.page = 1; renderTable(); });
  $('#fType').addEventListener('change', e => { State.tipo = e.target.value; State.page = 1; renderTable(); });
  $('#btnClearFilters').addEventListener('click', () => {
    const now = new Date();
    Object.assign(State, { period: now.getMonth(), year: now.getFullYear(), categoria: '', status: '', tipo: '', search: '', page: 1 });
    $('#fPeriod').value = String(State.period); $('#fYear').value = State.year;
    $('#fCat').value = ''; $('#fStatus').value = ''; $('#fType').value = ''; $('#txSearch').value = '';
    renderAll();
  });

  // Tabela
  $('#txSearch').addEventListener('input', e => { State.search = e.target.value; State.page = 1; renderTable(); });
  $('#txPerPage').addEventListener('change', e => { State.perPage = +e.target.value; State.page = 1; renderTable(); });
  $('#txPrev').addEventListener('click', () => { State.page--; renderTable(); });
  $('#txNext').addEventListener('click', () => { State.page++; renderTable(); });

  document.addEventListener('click', async e => {
    // Qualquer botão "adicionar" da página abre direto o formulário do tipo certo.
    const add = e.target.closest('[data-add]');
    if (add) { openTxModal(add.dataset.add); return; }

    const edit = e.target.closest('[data-edit]');
    if (edit) { const t = Repo.all().find(x => x.id === edit.dataset.edit); if (t) openTxModal(null, t); return; }

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

    const salEdit = e.target.closest('[data-sal-edit]');
    if (salEdit) { openSalaryForm(Repo.salaries().find(s => s.id === salEdit.dataset.salEdit)); return; }

    const salDel = e.target.closest('[data-sal-del]');
    if (salDel) {
      const s = Repo.salaries().find(x => x.id === salDel.dataset.salDel);
      if (s && confirm(`Excluir o período de ${money(s.valor)} iniciado em ${fmtDate(s.inicio)}?`)) {
        await Repo.removeSalary(s.id); renderSalaryList(); renderAll(); toast('Período excluído.', 'warn');
      }
      return;
    }

    if (e.target.closest('[data-close]')) {
      const ov = e.target.closest('.overlay');
      closeModal('#' + ov.id);
      if (ov.id === 'ovSalaryForm') openSalaryList();
      return;
    }

    // Fecha o menu de dados ao clicar fora
    if (!e.target.closest('#btnExport') && !e.target.closest('#menuExport')) $('#menuExport').classList.add('hidden');
  });

  $$('.overlay').forEach(o => o.addEventListener('mousedown', e => { if (e.target === o) closeModal('#' + o.id); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.overlay.open').forEach(o => closeModal('#' + o.id)); });

  // Abas do gráfico de evolução
  $('#evoTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    State.evoView = b.dataset.view; applyEvoView();
  });

  // Lançamentos
  $('#txForm').addEventListener('submit', submitTx);
  $('#txDelete').addEventListener('click', async () => {
    if (State.editingId && confirm('Excluir este lançamento?')) {
      await Repo.remove(State.editingId); State.editingId = null;
      closeModal('#ovTx'); renderAll(); toast('Lançamento excluído.', 'warn');
    }
  });

  // Salário e benefícios
  $('#btnSalary').addEventListener('click', openSalaryList);
  $('#btnSalaryCta').addEventListener('click', () => openSalaryForm(null));
  $('#btnNewSalary').addEventListener('click', () => openSalaryForm(null));
  $('#btnAddBenefit').addEventListener('click', () => addBenefitRow({ frequencia: 'mes' }));
  $('#salaryForm').addEventListener('submit', submitSalary);
  $('#salAtual').addEventListener('change', e => {
    $('#salFim').disabled = e.target.checked;
    if (e.target.checked) $('#salFim').value = '';
  });
  ['#salValor', '#salInicio', '#salFim'].forEach(sel =>
    $(sel).addEventListener('input', () => { delete $('#salWarn').dataset.ack; $('#salWarn').classList.add('hidden'); }));
  $('#salDelete').addEventListener('click', async () => {
    if (State.editingSalaryId && confirm('Excluir este período de salário?')) {
      await Repo.removeSalary(State.editingSalaryId);
      State.editingSalaryId = null;
      closeModal('#ovSalaryForm'); renderAll(); openSalaryList(); toast('Período excluído.', 'warn');
    }
  });

  // Menu de dados
  $('#btnExport').addEventListener('click', e => { e.stopPropagation(); $('#menuExport').classList.toggle('hidden'); });
  $('#menuExport').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    $('#menuExport').classList.add('hidden');
    ({ json: exportJSON, csv: exportCSV, demo: loadDemo, wipe: wipeAll,
       import: () => $('#importFile').click() })[b.dataset.act]?.();
  });
  $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });

  // Como usar
  $('#helpToggle').addEventListener('click', () => {
    const open = $('#helpBody').classList.toggle('hidden');
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

  if (Repo._migrated) {
    toast('Seu salário virou um período com data de início. Confira em "Salário e Benefícios".', 'info');
  } else if (!Repo.salaries().length && !Repo.all().length) {
    toast('Comece cadastrando seu salário no botão "Salário e Benefícios".', 'info');
  }
}

// O boot espera o documento inteiro: as funções do relatório PDF são declaradas no
// bloco de script seguinte, e só existem depois que o HTML termina de ser lido.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
