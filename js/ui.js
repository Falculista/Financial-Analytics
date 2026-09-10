/* ==================================================================================
   8. KPIs
   ================================================================================== */

function pctDelta(cur, prev) {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}
function deltaText(cur, prev, invert = false, label = 'período anterior') {
  const d = pctDelta(cur, prev);
  if (d === null || !isFinite(d)) return `Sem base do ${label}`;
  const up = d >= 0;
  const good = invert ? !up : up;
  const arrow = up ? '▲' : '▼';
  const color = Math.abs(d) < 0.05 ? 'var(--text-3)' : (good ? 'var(--ok)' : 'var(--danger)');
  return `<span style="color:${color};font-weight:600">${arrow} ${Math.abs(d).toFixed(1)}%</span> vs. ${label}`;
}

function renderKpis() {
  const txs = Repo.all(), sal = Repo.salaries();
  const cur = Calc.rangeSummary(State.keys, txs, sal);
  const prev = Calc.rangeSummary(State.previousKeys, txs, sal);
  const recv = Calc.receivableTotals(txs);
  const base = State.isYear ? 'ano anterior' : 'mês anterior';

  $('#hdrPeriod').textContent = State.periodLabel;
  $('#kpiRevenueLabel').textContent = State.isYear ? 'Receita do Ano' : 'Receita do Mês';
  $('#kpiExpenseLabel').textContent = State.isYear ? 'Despesas do Ano' : 'Despesas do Mês';

  $('#kpiRevenue').textContent = money(cur.receita);
  // Nota do card: quando é um mês só, explica a composição; no ano, o total de meses.
  const partes = [];
  if (cur.salario > 0) partes.push('salário');
  if (cur.totalBeneficios > 0) partes.push('benefícios');
  if (cur.extra > 0) partes.push('extras');
  $('#kpiRevenueSub').innerHTML = prev.receita
    ? deltaText(cur.receita, prev.receita, false, base)
    : (partes.length ? `Composta por ${partes.join(' + ')}` : `Sem base do ${base}`);

  $('#kpiExpense').textContent = money(cur.despesa);
  $('#kpiExpenseSub').innerHTML = deltaText(cur.despesa, prev.despesa, true, base);

  const neg = cur.saldo < 0;
  $('#kpiBalance').textContent = money(cur.saldo);
  $('#kpiBalance').style.color = neg ? 'var(--danger)' : 'var(--ok)';
  $('#kpiBalanceCard').style.setProperty('--kpi-color', neg ? 'var(--danger)' : 'var(--ok)');
  $('#kpiBalanceSub').innerHTML = neg
    ? `<span style="color:var(--danger);font-weight:600">Déficit</span> · gastou ${money(Math.abs(cur.saldo))} a mais`
    : `<span style="color:var(--ok);font-weight:600">Superávit</span> · ${cur.receita ? pctTxt(cur.saldo, cur.receita) : '0%'} da receita sobrou`;

  $('#kpiReceivable').textContent = money(recv.aReceber);
  $('#kpiReceivableSub').innerHTML = recv.atrasado > 0
    ? `<span style="color:var(--danger);font-weight:600">${money(recv.atrasado)} em atraso</span> · ${recv.countAtrasado} lançamento(s)`
    : (recv.aReceber > 0 ? `${recv.countPendente} pendência(s) dentro do prazo` : 'Nada pendente — tudo em dia');

  $('#kpiOvertime').textContent = hours(cur.horasExtras);
  $('#kpiOvertimeSub').innerHTML = cur.horasExtras > 0
    ? `<span style="color:var(--text-1);font-weight:600">${money(cur.extra)}</span> · ${pctTxt(cur.extra, cur.receita, 1)} da receita`
    : 'Nenhuma hora extra registrada';

  $('#noSalary').classList.toggle('hidden', Repo.salaries().length > 0);
}

/* ==================================================================================
   8b. ANÁLISES E INSIGHTS
   ================================================================================== */

const INSIGHT_ICONS = {
  trend: '<path d="M3 17l6-6 4 4 7-8"/><path d="M17 7h4v4"/>',
  piggy: '<path d="M4 12a7 7 0 0 1 7-7h3a6 6 0 0 1 6 6v1h2v3h-2a6 6 0 0 1-3 3v2h-3v-1h-3v1H8v-2a7 7 0 0 1-4-6Z"/><path d="M9 9h.01"/>',
  up:    '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  down:  '<path d="M12 5v14"/><path d="m5 12 7 7 7-7"/>',
  pie:   '<path d="M21 12A9 9 0 1 1 12 3v9Z"/><path d="M16 3.5A9 9 0 0 1 20.5 8H16Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
  hand:  '<path d="M12 3v9"/><path d="M8 21h8a4 4 0 0 0 4-4v-5"/><path d="M4 12v5a4 4 0 0 0 4 4"/>',
  card:  '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/>',
};
const TOM_COLOR = { bom: 'var(--ok)', ruim: 'var(--danger)', atencao: 'var(--warn)', neutro: 'var(--accent-2)' };

function renderInsights() {
  const list = Calc.insights(State.keys, Repo.all(), Repo.salaries());
  $('#insightsSub').textContent = State.isYear
    ? `Leituras automáticas do ano de ${State.year}` : `Leituras automáticas de ${State.periodLabel.toLowerCase()}`;

  if (!list.length) {
    $('#insightsBody').innerHTML = emptyState('Ainda não há o que analisar',
      'Cadastre seu salário e lance algumas despesas — as análises aparecem sozinhas.');
    $('#insightsBody').className = '';
    return;
  }
  $('#insightsBody').className = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3';
  $('#insightsBody').innerHTML = list.map(i => `
    <div class="insight" style="--tom:${TOM_COLOR[i.tom] || TOM_COLOR.neutro}">
      <div class="insight-top">
        <span class="insight-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${INSIGHT_ICONS[i.icone] || INSIGHT_ICONS.trend}</svg>
        </span>
        <span class="insight-title">${esc(i.titulo)}</span>
      </div>
      <p class="insight-value">${esc(i.valor)}</p>
      <p class="insight-note">${esc(i.nota)}</p>
    </div>`).join('');
}

/* ==================================================================================
   9. TABELAS
   ================================================================================== */

function statusPill(t) {
  if (t.kind === 'a_receber') {
    const s = Calc.receivableStatus(t);
    if (s === 'pago') return `<span class="pill pill-ok"><span class="pill-dot" style="background:currentColor"></span>Pago</span>`;
    if (s === 'atrasado') return `<span class="pill pill-danger"><span class="pill-dot" style="background:currentColor"></span>Atrasado</span>`;
    return `<span class="pill pill-warn"><span class="pill-dot" style="background:currentColor"></span>Pendente</span>`;
  }
  return t.status === 'pendente'
    ? `<span class="pill pill-warn"><span class="pill-dot" style="background:currentColor"></span>Pendente</span>`
    : `<span class="pill pill-ok"><span class="pill-dot" style="background:currentColor"></span>Pago</span>`;
}

function kindPill(kind) {
  const k = KINDS[kind];
  const inflow = k?.flow === 'in';
  return `<span class="pill pill-neutral" style="color:${inflow ? 'var(--s1)' : 'var(--s2)'};background:color-mix(in srgb, ${inflow ? 'var(--s1)' : 'var(--s2)'} 14%, transparent)">${esc(k?.label || kind)}</span>`;
}

function renderTable() {
  const rows = filteredTransactions();
  $('#txCount').textContent = rows.length;

  if (!rows.length) {
    $('#txBody').innerHTML = emptyState('Nenhum lançamento no filtro atual',
      'Ajuste os filtros acima ou lance sua primeira despesa do período.',
      { label: 'Adicionar despesa', kind: 'despesa' });
    $('#txPager').classList.add('hidden');
    return;
  }

  const per = State.perPage;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  State.page = Math.min(State.page, pages);
  const slice = rows.slice((State.page - 1) * per, State.page * per);

  const totalIn = rows.filter(t => KINDS[t.kind]?.flow === 'in').reduce((s, t) => s + num(t.valor), 0);
  const totalOut = rows.filter(t => KINDS[t.kind]?.flow === 'out').reduce((s, t) => s + num(t.valor), 0);

  $('#txBody').innerHTML = `<table class="data">
    <thead><tr>
      <th style="width:98px">Data</th><th>Descrição</th><th style="width:150px">Tipo</th>
      <th style="width:130px">Categoria</th><th class="num" style="width:120px">Valor</th>
      <th style="width:110px">Status</th><th style="width:84px"></th>
    </tr></thead>
    <tbody>${slice.map(t => {
      const inflow = KINDS[t.kind]?.flow === 'in';
      const extra = t.horas ? ` · ${hours(t.horas)} × ${money(t.valorHora)}` : '';
      return `<tr>
        <td style="color:var(--text-2);font-variant-numeric:tabular-nums">${fmtDate(t.data)}</td>
        <td><span style="font-weight:550">${esc(t.descricao || KINDS[t.kind]?.label || '—')}</span>${extra
          ? `<span style="color:var(--text-3)">${extra}</span>` : ''}
          ${t.observacao ? `<span style="display:block;font-size:11px;color:var(--text-3)">${esc(t.observacao)}</span>` : ''}</td>
        <td>${kindPill(t.kind)}</td>
        <td style="color:var(--text-2)">${esc(t.categoria || '—')}</td>
        <td class="num" style="font-weight:600;color:${inflow ? 'var(--ok)' : 'var(--danger)'}">${inflow ? '+' : '−'} ${money(Math.abs(num(t.valor)))}</td>
        <td>${statusPill(t)}</td>
        <td>
          <div class="flex gap-1 justify-end">
            <button class="btn btn-icon btn-ghost" data-edit="${t.id}" title="Editar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button class="btn btn-icon btn-ghost" data-del="${t.id}" title="Excluir" style="color:var(--danger)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
            </button>
          </div>
        </td></tr>`;
    }).join('')}</tbody>
    <tfoot><tr style="border-top:1px solid var(--border)">
      <td colspan="4" style="padding:11px 12px;font-weight:600">Total do filtro</td>
      <td class="num" style="padding:11px 12px;font-weight:650">
        <span style="color:var(--ok)">+${money(totalIn)}</span><br>
        <span style="color:var(--danger)">−${money(totalOut)}</span></td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table>`;

  if (pages > 1) {
    $('#txPager').classList.remove('hidden');
    $('#txPageInfo').textContent = `Página ${State.page} de ${pages} · ${rows.length} lançamentos`;
    $('#txPrev').disabled = State.page === 1;
    $('#txNext').disabled = State.page === pages;
  } else $('#txPager').classList.add('hidden');
}

function renderReceivables() {
  const set = new Set(State.keys);
  const list = Calc.receivables(Repo.all())
    .filter(t => t._status !== 'pago' || set.has(monthKey(t.dataPrevista || t.data)));
  const late = list.filter(t => t._status === 'atrasado');
  $('#lateBadgeTxt').textContent = `${late.length} em atraso`;
  $('#lateBadge').className = late.length ? 'pill pill-danger' : 'pill pill-ok';

  if (!list.length) {
    $('#receivableBody').innerHTML = emptyState('Nada a receber',
      'Quando o patrão atrasar horas extras, benefícios ou salário, registre aqui e acompanhe até a quitação.',
      { label: 'Registrar pendência', kind: 'a_receber' });
    return;
  }
  $('#receivableBody').innerHTML = `<table class="data">
    <thead><tr>
      <th>Descrição</th><th style="width:130px">Referente a</th>
      <th style="width:110px">Previsto</th><th style="width:110px">Pago em</th>
      <th class="num" style="width:120px">Valor</th><th style="width:150px">Status</th><th style="width:120px"></th>
    </tr></thead><tbody>
    ${list.map(t => `<tr>
      <td><span style="font-weight:550">${esc(t.descricao || 'Pendência')}</span>
        ${t.observacao ? `<span style="display:block;font-size:11px;color:var(--text-3)">${esc(t.observacao)}</span>` : ''}</td>
      <td style="color:var(--text-2)">${esc(t.categoria || '—')}</td>
      <td style="color:var(--text-2);font-variant-numeric:tabular-nums">${fmtDate(t.dataPrevista || t.data)}</td>
      <td style="color:var(--text-2);font-variant-numeric:tabular-nums">${t.dataPagamento ? fmtDate(t.dataPagamento) : '—'}</td>
      <td class="num" style="font-weight:600">${money(t.valor)}</td>
      <td>${statusPill(t)}${t._late ? `<span style="display:block;font-size:10.5px;color:var(--danger);margin-top:3px">${t._late} dia(s) de atraso</span>` : ''}</td>
      <td><div class="flex gap-1 justify-end">
        ${t._status !== 'pago' ? `<button class="btn btn-ghost" data-settle="${t.id}" style="font-size:11.5px;padding:5px 9px">Quitar</button>` : ''}
        <button class="btn btn-icon btn-ghost" data-edit="${t.id}" title="Editar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button></div></td></tr>`).join('')}
    </tbody></table>`;
}

/* ==================================================================================
   10. RENDER GERAL
   ================================================================================== */

function renderAll() {
  enhanceSelects();          // mantém os selects customizados em dia com os valores
  renderKpis();
  renderInsights();
  renderEvolution();
  renderExpenses();
  renderRevenue();
  renderStatus();
  renderOvertime();
  renderReceivables();
  renderTable();
  applyEvoView();
}

function applyEvoView() {
  const chart = State.evoView === 'chart';
  $('#chEvolution').parentElement.classList.toggle('hidden', !chart);
  $('#evoTableWrap').classList.toggle('hidden', chart);
  $$('#evoTabs .tab').forEach(b => b.classList.toggle('active', b.dataset.view === State.evoView));
}

/* ==================================================================================
   11. FILTROS
   ================================================================================== */

function buildFilters() {
  const now = new Date();
  $('#fPeriod').innerHTML =
    `<option value="year">O ano todo</option>`
    + `<optgroup label="Mês">${MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</optgroup>`;

  const years = new Set([now.getFullYear()]);
  Repo.all().forEach(t => { const y = parseInt(String(t.data).slice(0, 4)); if (y) years.add(y); });
  Repo.salaries().forEach(s => { const y = parseInt(String(s.inicio).slice(0, 4)); if (y) years.add(y); });
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) years.add(y);
  $('#fYear').innerHTML = [...years].sort().map(y => `<option value="${y}">${y}</option>`).join('');

  $('#fCat').innerHTML = `<option value="">Todas as categorias</option>`
    + `<optgroup label="Despesas">${EXPENSE_CATS.map(c => `<option value="${c}">${c}</option>`).join('')}</optgroup>`
    + `<optgroup label="Receitas">${REVENUE_FILTER_CATS.map(c => `<option value="${c}">${c}</option>`).join('')}</optgroup>`;

  $('#fPeriod').value = String(State.period);
  $('#fYear').value = State.year;
}

/* ==================================================================================
   12. TEMA
   ================================================================================== */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('#icoMoon').classList.toggle('hidden', theme === 'light');
  $('#icoSun').classList.toggle('hidden', theme !== 'light');
  Chart.defaults.color = token('--text-3');
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
}
