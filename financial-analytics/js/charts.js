/* ==================================================================================
   7. GRÁFICOS
   ================================================================================== */

const charts = {};

/**
 * Rótulos diretos nas pontas das barras — substitui o chartjs-plugin-datalabels.
 * É uma FÁBRICA de plugin local (entra no array `plugins` de cada gráfico) em vez de
 * um plugin global com opções: o Chart.js trata qualquer função dentro de `options`
 * como "scriptable" e a executaria com o contexto errado.
 */
function labelPlugin(format, color) {
  return {
    id: 'directLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = color || token('--text-2');
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((el, i) => {
          const v = ds.data[i];
          if (v === null || v === undefined || v === 0) return;
          const txt = format ? format(v) : String(v);
          if (chart.options.indexAxis === 'y') {
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(txt, el.x + 8, el.y);
          } else {
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(txt, el.x, el.y - 6);
          }
        });
      });
      ctx.restore();
    },
  };
}

function baseChartOptions(p) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 420 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: p.surface3,
        borderColor: p.border || 'rgba(255,255,255,.14)',
        borderWidth: 1,
        titleColor: p.text1,
        bodyColor: p.text2,
        padding: 11,
        cornerRadius: 9,
        boxPadding: 5,
        usePointStyle: true,
        titleFont: { size: 12, weight: '600' },
        bodyFont: { size: 12 },
        displayColors: true,
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: p.axis }, ticks: { color: p.text3, font: { size: 11 }, maxRotation: 0, autoSkip: true } },
      y: { grid: { color: p.grid, drawTicks: false }, border: { display: false }, ticks: { color: p.text3, font: { size: 11 }, padding: 8, maxTicksLimit: 6 } },
    },
  };
}

function destroyChart(k) { if (charts[k]) { charts[k].destroy(); delete charts[k]; } }

/* ---- 7.1 Evolução mensal (linha) ------------------------------------------------ */
function renderEvolution() {
  const p = palette();
  const serie = Calc.series(State.key, 12, Repo.all(), Repo.settings());
  const labels = serie.map(s => monthLabel(s.key));
  const mk = (label, data, color) => ({
    label, data, borderColor: color, backgroundColor: color,
    borderWidth: 2, tension: .32,
    pointRadius: 4, pointHoverRadius: 6,
    pointBackgroundColor: color, pointBorderColor: p.surface, pointBorderWidth: 2,
    fill: false,
  });

  destroyChart('evo');
  const o = baseChartOptions(p);
  o.plugins.tooltip.callbacks = { label: c => ` ${c.dataset.label}: ${money(c.parsed.y)}` };
  o.scales.y.ticks.callback = v => moneyAxis(v);

  charts.evo = new Chart($('#chEvolution'), {
    type: 'line',
    data: { labels, datasets: [
      mk('Receita', serie.map(s => s.receita), p.s[0]),
      mk('Despesa', serie.map(s => s.despesa), p.s[1]),
      mk('Saldo',   serie.map(s => s.saldo),   p.s[2]),
    ] },
    options: o,
  });

  // Legenda em HTML: mostra o valor do mês selecionado ao lado do nome da série.
  const cur = serie[serie.length - 1];
  $('#evoLegend').innerHTML = [
    ['Receita', p.s[0], cur.receita], ['Despesa', p.s[1], cur.despesa], ['Saldo', p.s[2], cur.saldo],
  ].map(([n, c, v]) => `<span class="legend-item"><span class="legend-swatch" style="background:${c}"></span>${n}
      <span class="legend-val">${money(v)}</span></span>`).join('');

  // Tabela-espelho (mesma informação sem depender de cor)
  $('#evoTableWrap').innerHTML = `<table class="data"><thead><tr>
      <th>Mês</th><th class="num">Receita</th><th class="num">Despesa</th><th class="num">Saldo</th></tr></thead><tbody>
      ${serie.slice().reverse().map(s => `<tr><td>${monthLabelLong(s.key)}</td>
        <td class="num">${money(s.receita)}</td><td class="num">${money(s.despesa)}</td>
        <td class="num" style="color:${s.saldo < 0 ? 'var(--danger)' : 'var(--ok)'}">${money(s.saldo)}</td></tr>`).join('')}
    </tbody></table>`;
}

/* ---- 7.2 Despesas por categoria (donut) ----------------------------------------- */
function renderExpenses() {
  const p = palette();
  const map = Calc.expensesByCategory(State.key, Repo.all());
  const entries = [...map.entries()].filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  destroyChart('exp');
  const canvas = $('#chExpenses');
  if (!entries.length) {
    canvas.parentElement.style.display = 'none';
    $('#expEmpty').className = '';
    $('#expEmpty').innerHTML = emptyState('Nenhuma despesa neste mês', 'Lance uma despesa em "Novo Lançamento" para ver a distribuição por categoria.');
    $('#expLegend').innerHTML = '';
    return;
  }
  canvas.parentElement.style.display = '';
  $('#expEmpty').className = 'hidden';

  const colors = entries.map(([c]) => p.s[EXPENSE_SLOT[EXPENSE_CATS.indexOf(c)]] || p.s[5]);
  const o = baseChartOptions(p);
  o.interaction = { mode: 'nearest', intersect: true };
  o.scales = {};
  o.cutout = '64%';
  o.plugins.tooltip.callbacks = {
    label: c => ` ${c.label}: ${money(c.parsed)} (${((c.parsed / total) * 100).toFixed(1)}%)`,
  };

  charts.exp = new Chart(canvas, {
    type: 'doughnut',
    data: { labels: entries.map(([c]) => c), datasets: [{
      data: entries.map(([, v]) => v),
      backgroundColor: colors,
      borderColor: p.surface, borderWidth: 2, hoverOffset: 6,   // 2px de respiro entre fatias
    }] },
    options: o,
    plugins: [{
      id: 'donutCenter',
      afterDraw(ch) {
        const { ctx, chartArea } = ch;
        const cx = (chartArea.left + chartArea.right) / 2, cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = token('--text-3');
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.fillText('TOTAL', cx, cy - 12);
        ctx.fillStyle = token('--text-1');
        ctx.font = '650 19px system-ui, sans-serif';
        ctx.fillText(money(total), cx, cy + 10);
        ctx.restore();
      },
    }],
  });

  $('#expLegend').innerHTML = entries.map(([c, v], i) =>
    `<span class="legend-item"><span class="legend-swatch" style="background:${colors[i]}"></span>${esc(c)}
      <span class="legend-val">${money(v)}</span></span>`).join('');
}

/* ---- 7.3 Receita por categoria (barras horizontais) ----------------------------- */
function renderRevenue() {
  const p = palette();
  const s = Calc.monthSummary(State.key, Repo.all(), Repo.settings());
  const rows = [
    ['Salário', s.salario], ['Vale Transporte', s.vt], ['Hora Extra', s.extra],
  ].concat(s.outras > 0 ? [['Outras receitas', s.outras]] : []);
  const total = rows.reduce((a, [, v]) => a + v, 0);

  destroyChart('rev');
  const canvas = $('#chRevenue');
  if (total <= 0) {
    canvas.parentElement.style.display = 'none';
    $('#revEmpty').className = '';
    $('#revEmpty').innerHTML = emptyState('Sem receita neste mês', 'Configure o salário e o VT em Configurações, ou lance horas extras.');
    return;
  }
  canvas.parentElement.style.display = '';
  $('#revEmpty').className = 'hidden';

  const o = baseChartOptions(p);
  o.indexAxis = 'y';
  o.interaction = { mode: 'nearest', intersect: true };
  o.layout = { padding: { right: 88 } };                 // espaço para o rótulo direto
  o.scales.x = { grid: { color: p.grid, drawTicks: false }, border: { display: false }, ticks: { color: p.text3, font: { size: 11 }, maxTicksLimit: 4, maxRotation: 0, autoSkip: true, callback: v => moneyAxis(v) } };
  o.scales.y = { grid: { display: false }, border: { color: p.axis }, ticks: { color: p.text2, font: { size: 11.5 } } };
  o.plugins.tooltip.callbacks = { label: c => ` ${money(c.parsed.x)} · ${((c.parsed.x / total) * 100).toFixed(1)}% da receita` };

  charts.rev = new Chart(canvas, {
    type: 'bar',
    data: { labels: rows.map(r => r[0]), datasets: [{
      label: 'Receita', data: rows.map(r => r[1]),
      backgroundColor: p.s[0], borderRadius: 4, borderSkipped: false,
      barPercentage: .62, categoryPercentage: .8,
    }] },
    options: o,
    plugins: [labelPlugin(v => money(v), p.text2)],
  });
}

/* ---- 7.4 Status de pagamentos do patrão (barras) -------------------------------- */
function renderStatus() {
  const p = palette();
  const t = Calc.receivableTotals(Repo.all());
  const rows = [['Pago', t.pago, p.ok], ['Pendente', t.pendente, p.warn], ['Atrasado', t.atrasado, p.danger]];
  const total = rows.reduce((a, r) => a + r[1], 0);

  destroyChart('st');
  const canvas = $('#chStatus');
  if (total <= 0) {
    canvas.parentElement.style.display = 'none';
    $('#stEmpty').className = '';
    $('#stEmpty').innerHTML = emptyState('Nada registrado', 'Use "Registrar pendência" para anotar o que o patrão ainda deve.');
    return;
  }
  canvas.parentElement.style.display = '';
  $('#stEmpty').className = 'hidden';

  const o = baseChartOptions(p);
  o.interaction = { mode: 'nearest', intersect: true };
  o.layout = { padding: { top: 22 } };
  o.scales.y.ticks.callback = v => moneyAxis(v);
  o.plugins.tooltip.callbacks = { label: c => ` ${money(c.parsed.y)}` };

  charts.st = new Chart(canvas, {
    type: 'bar',
    data: { labels: rows.map(r => r[0]), datasets: [{
      label: 'Valor', data: rows.map(r => r[1]),
      backgroundColor: rows.map(r => r[2]), borderRadius: 4, borderSkipped: false,
      barPercentage: .55, categoryPercentage: .8,
    }] },
    options: o,
    plugins: [labelPlugin(v => money(v), p.text2)],
  });
}

/* ---- 7.5 Horas extras por semana (barras) --------------------------------------- */
function renderOvertime() {
  const p = palette();
  const weeks = Calc.overtimeByWeek(State.key, Repo.all());
  const total = weeks.reduce((a, b) => a + b, 0);

  destroyChart('ot');
  const canvas = $('#chOvertime');
  if (total <= 0) {
    canvas.parentElement.style.display = 'none';
    $('#otEmpty').className = '';
    $('#otEmpty').innerHTML = emptyState('Sem horas extras neste mês', 'Lance uma hora extra para acompanhar a distribuição por semana.');
    return;
  }
  canvas.parentElement.style.display = '';
  $('#otEmpty').className = 'hidden';

  const o = baseChartOptions(p);
  o.interaction = { mode: 'nearest', intersect: true };
  o.layout = { padding: { top: 22 } };
  o.scales.y.ticks.callback = v => v + 'h';
  o.plugins.tooltip.callbacks = {
    label: c => ` ${hours(c.parsed.y)} · ${money(c.parsed.y * num(Repo.settings().valorHoraExtra))}`,
  };

  charts.ot = new Chart(canvas, {
    type: 'bar',
    data: { labels: weeks.map((_, i) => `Semana ${i + 1}`), datasets: [{
      label: 'Horas', data: weeks,
      backgroundColor: p.s[0], borderRadius: 4, borderSkipped: false,
      barPercentage: .55, categoryPercentage: .8,
    }] },
    options: o,
    plugins: [labelPlugin(v => hours(v), p.text2)],
  });
}
