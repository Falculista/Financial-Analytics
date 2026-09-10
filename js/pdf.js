/* ==================================================================================
   20. RELATÓRIO PDF
   ----------------------------------------------------------------------------------
   Estratégia de qualidade:
     · Texto, cards, tabelas e cabeçalhos são desenhados como VETOR pelo jsPDF —
       ficam nítidos em qualquer zoom e na impressão (html2canvas rasterizaria tudo).
     · Só os GRÁFICOS viram imagem, geradas em 2× a partir de instâncias do Chart.js
       montadas fora da tela no tamanho exato do PDF (nada de esticar o canvas da tela).
     · html2canvas fica carregado como plano B: se a exportação do canvas falhar em
       algum navegador, o gráfico é capturado por ele.
     · A quebra de página é controlada por `ensure()`: antes de desenhar qualquer
       bloco, verificamos se ele cabe; se não couber, abre-se página nova com o mesmo
       cabeçalho e rodapé. Por isso nada sai cortado.
   ================================================================================== */

const PDF = {
  W: 210, H: 297, M: 14,          // A4 retrato, em milímetros
  get CW() { return this.W - this.M * 2; },

  // Paleta do relatório — espelha o tema dark do painel
  c: {
    bg: '#0B0F1A', card: '#111827', card2: '#161F33', border: '#26324A',
    t1: '#F1F5F9', t2: '#94A3B8', t3: '#64748B',
    a1: '#8B5CF6', a2: '#3B82F6', a3: '#EC4899',
    s1: '#9085e9', s2: '#d55181', s3: '#c98500', s4: '#199e70', s5: '#3987e5', s6: '#e66767',
    ok: '#22C55E', warn: '#FAB219', danger: '#EF5350',
  },
};

const hex2rgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** jsPDF usa fontes WinAnsi: normaliza espaços especiais e sinais unicode. */
const sane = s => String(s ?? '').replace(/ /g, ' ').replace(/[−–—]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
const pMoney = n => sane(money(n));

/* ---- 20.1 Modal ----------------------------------------------------------------- */

function applyPdfPreset(preset) {
  $$('#pdfPresets .tab').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
  const now = new Date();
  const first = (y, m) => isoOf(new Date(y, m, 1));
  const last  = (y, m) => isoOf(new Date(y, m + 1, 0));
  let from, to;
  if (preset === 'this-month')      { from = first(State.year, State.month); to = last(State.year, State.month); }
  else if (preset === 'last-month') { const d = new Date(State.year, State.month - 1, 1); from = first(d.getFullYear(), d.getMonth()); to = last(d.getFullYear(), d.getMonth()); }
  else if (preset === 'last-3')     { const d = new Date(State.year, State.month - 2, 1); from = first(d.getFullYear(), d.getMonth()); to = last(State.year, State.month); }
  else if (preset === 'this-year')  { from = first(now.getFullYear(), 0); to = last(now.getFullYear(), 11); }
  else return; // Personalizado: mantém o que o usuário digitou
  $('#pdfFrom').value = from; $('#pdfTo').value = to;
  syncPdfFilename();
}

function syncPdfFilename() {
  const from = $('#pdfFrom').value || todayISO();
  $('#pdfName').value = `relatorio-financeiro-${from.slice(0, 7)}.pdf`;
}

function openPdfModal() {
  applyPdfPreset('this-month');
  $('#pdfNotes').value = '';
  openModal('#ovPdf');
  ['#pdfFrom', '#pdfTo'].forEach(sel => $(sel).onchange = () => {
    $$('#pdfPresets .tab').forEach(b => b.classList.toggle('active', b.dataset.preset === 'custom'));
    syncPdfFilename();
  });
}

/* ---- 20.2 Agregação dos dados do período ---------------------------------------- */

/** Lista de chaves 'YYYY-MM' entre duas datas, inclusive. */
function monthsBetween(from, to) {
  const a = parseISO(from), b = parseISO(to);
  const out = [];
  if (!a || !b) return out;
  const d = new Date(a.getFullYear(), a.getMonth(), 1);
  while (d <= b) { out.push(monthKeyOf(d.getFullYear(), d.getMonth())); d.setMonth(d.getMonth() + 1); }
  return out;
}

function buildReport(from, to) {
  const txs = Repo.all(), sal = Repo.salaries();
  const keys = monthsBetween(from, to);
  const R = Calc.rangeSummary(keys, txs, sal);
  const months = R.months;
  const tot = R;

  // Lançamentos no intervalo exato de datas
  const inRange = t => { const d = (t.kind === 'a_receber' ? (t.dataPrevista || t.data) : t.data); return d >= from && d <= to; };
  const lancamentos = txs.filter(t => t.kind !== 'a_receber' && inRange(t))
                         .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const receivables = Calc.receivables(txs).filter(inRange);
  const recvTot = Calc.receivableTotals(txs, { from, to });

  // Despesas por categoria no período
  const byCat = new Map(EXPENSE_CATS.map(c => [c, 0]));
  txs.filter(t => t.kind === 'despesa' && inRange(t)).forEach(t => {
    const c = EXPENSE_CATS.includes(t.categoria) ? t.categoria : 'Outros';
    byCat.set(c, round2(byCat.get(c) + num(t.valor)));
  });

  const insights = Calc.insights(keys, txs, sal);
  return { from, to, keys, months, tot, lancamentos, receivables, recvTot, byCat,
           salaries: sal, insights };
}

/* ---- 20.3 Gráficos em imagem ---------------------------------------------------- */

/** Fundo opaco no canvas — sem isso o PNG sai com alfa e o PDF escurece o gráfico. */
const pdfBackdrop = {
  id: 'pdfBackdrop',
  beforeDraw(chart) {
    const { ctx } = chart;
    ctx.save(); ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = PDF.c.card; ctx.fillRect(0, 0, chart.width, chart.height); ctx.restore();
  },
};

async function chartImage(config, wpx, hpx) {
  const canvas = document.createElement('canvas');
  canvas.width = wpx; canvas.height = hpx;
  canvas.style.width = wpx + 'px'; canvas.style.height = hpx + 'px';
  $('#pdfStage').appendChild(canvas);

  const cfg = JSON.parse(JSON.stringify({ type: config.type, data: config.data }));
  cfg.options = { ...config.options, responsive: false, animation: false, devicePixelRatio: 2 };
  cfg.plugins = [pdfBackdrop];

  const ch = new Chart(canvas, cfg);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  let img;
  try {
    img = ch.toBase64Image('image/png', 1);
  } catch (err) {                                   // plano B: html2canvas
    console.warn('[pdf] toBase64Image falhou, usando html2canvas', err);
    const shot = await html2canvas(canvas, { backgroundColor: PDF.c.card, scale: 2 });
    img = shot.toDataURL('image/png');
  }
  ch.destroy(); canvas.remove();
  return img;
}

/** Opções base dos gráficos do PDF — tipografia maior, sem interação. */
function pdfChartOpts(extra = {}) {
  return {
    plugins: { legend: { display: false }, tooltip: { enabled: false }, ...(extra.plugins || {}) },
    scales: extra.scales,
    indexAxis: extra.indexAxis,
    cutout: extra.cutout,
    layout: extra.layout,
    ...(extra.rest || {}),
  };
}
const pdfAxis = (yFmt) => ({
  x: { grid: { display: false }, border: { color: PDF.c.border }, ticks: { color: PDF.c.t3, font: { size: 11 }, maxRotation: 0 } },
  y: { grid: { color: '#1B2537', drawTicks: false }, border: { display: false }, ticks: { color: PDF.c.t3, font: { size: 11 }, maxTicksLimit: 6, maxRotation: 0, callback: yFmt } },
});

async function reportCharts(R) {
  const out = {};

  // 1. Evolução mensal (linha)
  const line = (label, data, color) => ({
    label, data, borderColor: color, backgroundColor: color, borderWidth: 2.4, tension: .32,
    pointRadius: 4, pointBackgroundColor: color, pointBorderColor: PDF.c.card, pointBorderWidth: 2, fill: false,
  });
  out.evolution = await chartImage({
    type: 'line',
    data: {
      labels: R.months.map(m => monthLabel(m.key)),
      datasets: [
        line('Receita', R.months.map(m => m.receita), PDF.c.s1),
        line('Despesa', R.months.map(m => m.despesa), PDF.c.s2),
        line('Saldo',   R.months.map(m => m.saldo),   PDF.c.s3),
      ],
    },
    options: pdfChartOpts({ scales: pdfAxis(v => moneyAxis(v)), layout: { padding: 10 } }),
  }, 1068, 444);   // 178mm x 74mm a ~6 px/mm — mesma proporção da caixa no PDF

  // 2. Despesas por categoria (rosca)
  const cats = [...R.byCat.entries()].filter(([, v]) => v > 0);
  if (cats.length) {
    out.expenses = await chartImage({
      type: 'doughnut',
      data: {
        labels: cats.map(c => c[0]),
        datasets: [{ data: cats.map(c => c[1]),
          backgroundColor: cats.map(([c]) => PDF.c['s' + (EXPENSE_SLOT[EXPENSE_CATS.indexOf(c)] + 1)] || PDF.c.s6),
          borderColor: PDF.c.card, borderWidth: 2 }],
      },
      options: pdfChartOpts({ cutout: '62%', layout: { padding: 10 } }),
    }, 510, 336);   // 85mm x 56mm
    out.expenseCats = cats;
  }

  // 3. Receita por categoria (barras horizontais)
  const rev = [['Salário', R.tot.salario]]
    .concat((R.tot.beneficios || []).map(b => [b.nome, b.valor]))
    .concat(R.tot.extra > 0 ? [['Hora Extra', R.tot.extra]] : [])
    .concat(R.tot.outras > 0 ? [['Outras receitas', R.tot.outras]] : [])
    .filter(r => r[1] > 0);
  if (!rev.length) rev.push(['Sem receita', 0]);
  out.revenue = await chartImage({
    type: 'bar',
    data: { labels: rev.map(r => r[0]), datasets: [{ data: rev.map(r => r[1]), backgroundColor: PDF.c.s1, borderRadius: 4, barPercentage: .6 }] },
    options: pdfChartOpts({
      indexAxis: 'y',
      scales: {
        x: { grid: { color: '#1B2537', drawTicks: false }, border: { display: false }, ticks: { color: PDF.c.t3, font: { size: 11 }, maxTicksLimit: 4, maxRotation: 0, callback: v => moneyAxis(v) } },
        y: { grid: { display: false }, border: { color: PDF.c.border }, ticks: { color: PDF.c.t2, font: { size: 12 } } },
      },
      layout: { padding: 10 },
    }),
  }, 510, 336);   // 85mm x 56mm

  // 4. Status de pagamentos do patrão
  if (R.recvTot.pago + R.recvTot.pendente + R.recvTot.atrasado > 0) {
    out.status = await chartImage({
      type: 'bar',
      data: { labels: ['Pago', 'Pendente', 'Atrasado'],
        datasets: [{ data: [R.recvTot.pago, R.recvTot.pendente, R.recvTot.atrasado],
          backgroundColor: [PDF.c.ok, PDF.c.warn, PDF.c.danger], borderRadius: 4, barPercentage: .5 }] },
      options: pdfChartOpts({ scales: pdfAxis(v => moneyAxis(v)), layout: { padding: 10 } }),
    }, 510, 336);   // 85mm x 56mm
  }
  return out;
}

/* ---- 20.4 Primitivas de desenho -------------------------------------------------- */

function makeCtx(doc, R, opts) {
  return {
    doc, R, opts, y: 0, page: 0,
    periodLabel: `${fmtDate(R.from)} a ${fmtDate(R.to)}`,
  };
}

function fill(doc, hex) { doc.setFillColor(...hex2rgb(hex)); }
function stroke(doc, hex) { doc.setDrawColor(...hex2rgb(hex)); }
function ink(doc, hex) { doc.setTextColor(...hex2rgb(hex)); }
function font(doc, size, weight = 'normal') { doc.setFont('helvetica', weight); doc.setFontSize(size); }

/** Pinta o fundo escuro + cabeçalho e rodapé de uma página de conteúdo. */
function pageChrome(C) {
  const { doc } = C;
  fill(doc, PDF.c.bg); doc.rect(0, 0, PDF.W, PDF.H, 'F');

  // Cabeçalho
  fill(doc, PDF.c.a1); doc.roundedRect(PDF.M, 11, 5.6, 5.6, 1.6, 1.6, 'F');
  fill(doc, PDF.c.a3); doc.roundedRect(PDF.M + 1.9, 12.9, 2.4, 2.4, .7, .7, 'F');
  font(doc, 10, 'bold'); ink(doc, PDF.c.t1);
  doc.text('Relatório Financeiro', PDF.M + 8.4, 15.4);
  font(doc, 8.5, 'normal'); ink(doc, PDF.c.t3);
  doc.text(sane(C.periodLabel), PDF.W - PDF.M, 15.4, { align: 'right' });
  stroke(doc, PDF.c.border); doc.setLineWidth(.25);
  doc.line(PDF.M, 19.5, PDF.W - PDF.M, 19.5);

  // Rodapé (o número da página é escrito no final, quando o total é conhecido)
  doc.line(PDF.M, PDF.H - 14, PDF.W - PDF.M, PDF.H - 14);
  font(doc, 8, 'normal'); ink(doc, PDF.c.t3);
  doc.text(sane(`Emitido em ${fmtDate(todayISO())}`), PDF.M, PDF.H - 9);

  C.y = 28;
}

function newPage(C) { C.doc.addPage(); pageChrome(C); }

/** Garante espaço vertical; se não houver, abre página nova. */
function ensure(C, h) { if (C.y + h > PDF.H - 20) { newPage(C); return true; } return false; }

/** Altura aproximada do começo de uma tabela — usada para o título não ficar órfão. */
function tblReserve(nLinhas, nRodape = 0) {
  return 8 + 7.2 * Math.min(nLinhas, 3) + nRodape * 8.2 + 2;
}

function sectionTitle(C, title, sub, reserve = 0) {
  // `reserve` é a altura do primeiro bloco da seção: sem isso o título cabia no pé
  // da página e o conteúdo pulava para a seguinte, deixando um buraco.
  ensure(C, 16 + reserve);
  const { doc } = C;
  fill(doc, PDF.c.a1); doc.roundedRect(PDF.M, C.y - 3.4, 1.5, 7.5, .75, .75, 'F');
  font(doc, 12, 'bold'); ink(doc, PDF.c.t1);
  doc.text(sane(title), PDF.M + 4.5, C.y + 1.6);
  if (sub) { font(doc, 8.5, 'normal'); ink(doc, PDF.c.t3); doc.text(sane(sub), PDF.M + 4.5, C.y + 6.2); C.y += 4.6; }
  C.y += 9;
}

/** Card de KPI: fio de luz no topo, rótulo, valor e nota auxiliar. */
function kpiCard(C, x, y, w, h, { label, value, note, color }) {
  const { doc } = C;
  fill(doc, PDF.c.card); stroke(doc, PDF.c.border); doc.setLineWidth(.25);
  doc.roundedRect(x, y, w, h, 2.6, 2.6, 'FD');
  fill(doc, color); doc.roundedRect(x + 4, y + .5, w - 8, .7, .35, .35, 'F');
  font(doc, 7, 'bold'); ink(doc, PDF.c.t3);
  doc.text(sane(label.toUpperCase()), x + 5, y + 7.5);
  font(doc, 14, 'bold'); ink(doc, PDF.c.t1);
  doc.text(sane(value), x + 5, y + 16.5);
  if (note) { font(doc, 7.5, 'normal'); ink(doc, PDF.c.t2); doc.text(sane(note), x + 5, y + 22); }
}

/**
 * Tabela com listras zebradas, cabeçalho repetido a cada página e rodapé de totais.
 * cols: [{ title, w (mm), align: 'left'|'right', get(row) → string, color?(row) → hex }]
 */
function table(C, cols, rows, footCells) {
  const { doc } = C;
  const rowH = 7.2, headH = 8;
  const x0 = PDF.M;

  const drawHead = () => {
    fill(doc, PDF.c.card2); doc.rect(x0, C.y, PDF.CW, headH, 'F');
    font(doc, 7, 'bold'); ink(doc, PDF.c.t3);
    let x = x0;
    cols.forEach(c => {
      doc.text(sane(c.title.toUpperCase()), c.align === 'right' ? x + c.w - 2.5 : x + 2.5, C.y + 5.4,
        { align: c.align === 'right' ? 'right' : 'left' });
      x += c.w;
    });
    C.y += headH;
  };

  // Aceita uma linha ([celulas]) ou várias ([[celulas], [celulas]]).
  const footRows = !footCells ? []
    : (Array.isArray(footCells[0]) || (footCells[0] === null && Array.isArray(footCells[1]))
        ? footCells : [footCells]);
  // Reserva cabeçalho + algumas linhas + o rodapé inteiro: assim o total nunca fica
  // órfão no topo da página seguinte.
  ensure(C, headH + rowH * Math.min(rows.length, 3) + footRows.length * (rowH + 1));
  drawHead();

  rows.forEach((r, i) => {
    if (C.y + rowH > PDF.H - 20) { newPage(C); drawHead(); }
    if (i % 2 === 1) { fill(doc, PDF.c.card); doc.rect(x0, C.y, PDF.CW, rowH, 'F'); }
    let x = x0;
    cols.forEach(c => {
      font(doc, 8, c.bold ? 'bold' : 'normal');
      ink(doc, c.color ? c.color(r) : PDF.c.t1);
      const raw = sane(c.get(r));
      const maxW = c.w - 5;
      let txt = raw;
      if (doc.getTextWidth(txt) > maxW) {            // nunca deixa texto invadir a coluna vizinha
        while (txt.length > 1 && doc.getTextWidth(txt + '...') > maxW) txt = txt.slice(0, -1);
        txt += '...';
      }
      doc.text(txt, c.align === 'right' ? x + c.w - 2.5 : x + 2.5, C.y + 4.9,
        { align: c.align === 'right' ? 'right' : 'left' });
      x += c.w;
    });
    stroke(doc, PDF.c.border); doc.setLineWidth(.12);
    doc.line(x0, C.y + rowH, x0 + PDF.CW, C.y + rowH);
    C.y += rowH;
  });

  if (footRows.length) {
    if (C.y + footRows.length * (rowH + 1) + 2 > PDF.H - 20) { newPage(C); drawHead(); }
    footRows.forEach((linha, li) => {
      fill(doc, PDF.c.card2); doc.rect(x0, C.y, PDF.CW, rowH + 1, 'F');
      let x = x0;
      cols.forEach((c, i) => {
        const v = linha[i];
        if (v) {
          font(doc, 8, 'bold'); ink(doc, v.color || PDF.c.t1);
          let txt = sane(v.text);
          const maxW = c.w - 5;                    // o rodapé respeita a coluna como as linhas
          if (doc.getTextWidth(txt) > maxW) {
            while (txt.length > 1 && doc.getTextWidth(txt + '...') > maxW) txt = txt.slice(0, -1);
            txt += '...';
          }
          doc.text(txt, c.align === 'right' ? x + c.w - 2.5 : x + 2.5, C.y + 5.4,
            { align: c.align === 'right' ? 'right' : 'left' });
        }
        x += c.w;
      });
      C.y += rowH + 1;
      if (li < footRows.length - 1) {
        stroke(doc, PDF.c.border); doc.setLineWidth(.12);
        doc.line(x0, C.y, x0 + PDF.CW, C.y);
      }
    });
  }
  C.y += 6;
}

/* ---- 20.5 Seções ----------------------------------------------------------------- */

/** Fundo da capa: gradientes radiais renderizados em canvas (720×1018 px ≈ A4 a 87dpi). */
function coverBackdrop() {
  const w = 720, h = 1018;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = PDF.c.bg; g.fillRect(0, 0, w, h);
  const halo = (cx, cy, r, rgba) => {
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, rgba); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  };
  halo(w * 0.12, -40, 520, 'rgba(139, 92, 246, 0.26)');
  halo(w * 0.92, -30, 470, 'rgba(59, 130, 246, 0.20)');
  halo(w * 0.50, h + 60, 460, 'rgba(236, 72, 153, 0.16)');
  return cv.toDataURL('image/png');
}

function drawCover(C) {
  const { doc, R } = C;
  fill(doc, PDF.c.bg); doc.rect(0, 0, PDF.W, PDF.H, 'F');

  // Brilho ambiente da capa: o PDF não tem gradiente radial nativo, então
  // desenhamos os halos num canvas e colamos como imagem de fundo. Sai suave
  // de verdade — círculos empilhados deixariam anéis visíveis.
  doc.addImage(coverBackdrop(), 'PNG', 0, 0, PDF.W, PDF.H);

  // Marca
  fill(doc, PDF.c.a1); doc.roundedRect(PDF.M, 42, 13, 13, 3.6, 3.6, 'F');
  fill(doc, PDF.c.a3); doc.roundedRect(PDF.M + 4.4, 46.4, 5, 5, 1.5, 1.5, 'F');
  font(doc, 9, 'bold'); ink(doc, PDF.c.t2);
  doc.text('FINANCIAL ANALYTICS', PDF.M + 17, 51);

  font(doc, 30, 'bold'); ink(doc, PDF.c.t1);
  doc.text('Relatório', PDF.M, 84);
  doc.text('Financeiro', PDF.M, 97);

  fill(doc, PDF.c.a3); doc.roundedRect(PDF.M, 105, 26, 1.3, .65, .65, 'F');

  font(doc, 10.5, 'normal'); ink(doc, PDF.c.t2);
  doc.text(sane(`Período de ${fmtDate(R.from)} a ${fmtDate(R.to)}`), PDF.M, 118);
  font(doc, 9, 'normal'); ink(doc, PDF.c.t3);
  doc.text(sane(`Emitido em ${fmtDate(todayISO())}`), PDF.M, 125);

  // Observação do usuário
  const notes = ($('#pdfNotes').value || '').trim();
  if (notes) {
    const lines = doc.splitTextToSize(sane(notes), PDF.CW - 14);
    const h = 14 + lines.length * 5;
    fill(doc, PDF.c.card); stroke(doc, PDF.c.border); doc.setLineWidth(.25);
    doc.roundedRect(PDF.M, 134, PDF.CW, h, 3, 3, 'FD');
    fill(doc, PDF.c.a3); doc.roundedRect(PDF.M, 137, 1.4, h - 6, .7, .7, 'F');
    font(doc, 7, 'bold'); ink(doc, PDF.c.t3);
    doc.text('OBSERVAÇÕES', PDF.M + 6, 141.5);
    font(doc, 9.5, 'normal'); ink(doc, PDF.c.t1);
    doc.text(lines, PDF.M + 6, 148);
  }

  // Resumo de topo na capa
  const y = 180, gap = 4, w = (PDF.CW - gap) / 2;
  font(doc, 7, 'bold'); ink(doc, PDF.c.t3);
  doc.text('RESUMO DO PERÍODO', PDF.M, y - 7);
  stroke(doc, PDF.c.border); doc.setLineWidth(.25);
  doc.line(PDF.M + 42, y - 8.6, PDF.W - PDF.M, y - 8.6);
  kpiCard(C, PDF.M, y, w, 27, { label: 'Receita do período', value: pMoney(R.tot.receita), note: `${R.months.length} mês(es) de competência`, color: PDF.c.s1 });
  kpiCard(C, PDF.M + w + gap, y, w, 27, { label: 'Despesas do período', value: pMoney(R.tot.despesa), note: `${R.lancamentos.filter(t => t.kind === 'despesa').length} lançamento(s)`, color: PDF.c.s2 });
  kpiCard(C, PDF.M, y + 30, w, 27, { label: 'Saldo líquido', value: pMoney(R.tot.saldo), note: R.tot.saldo < 0 ? 'Déficit no período' : 'Superávit no período', color: R.tot.saldo < 0 ? PDF.c.danger : PDF.c.ok });
  kpiCard(C, PDF.M + w + gap, y + 30, w, 27, { label: 'A receber do patrão', value: pMoney(R.recvTot.aReceber), note: `${R.recvTot.countAtrasado} em atraso`, color: PDF.c.warn });

  stroke(doc, PDF.c.border); doc.setLineWidth(.25);
  doc.line(PDF.M, PDF.H - 20, PDF.W - PDF.M, PDF.H - 20);
  font(doc, 7.5, 'normal'); ink(doc, PDF.c.t3);
  doc.text('Documento gerado automaticamente pelo painel Financial Analytics', PDF.M, PDF.H - 14);
}

function drawKpis(C) {
  const R = C.R;
  sectionTitle(C, 'Resumo Executivo', `Consolidado de ${C.periodLabel}`);
  const gap = 3.6, w = (PDF.CW - gap * 2) / 3;
  ensure(C, 62);
  const y = C.y;
  kpiCard(C, PDF.M, y, w, 28, { label: 'Receita total', value: pMoney(R.tot.receita), note: 'Salário + benefícios + extras - descontos', color: PDF.c.s1 });
  kpiCard(C, PDF.M + w + gap, y, w, 28, { label: 'Despesas totais', value: pMoney(R.tot.despesa), note: 'Somatório dos lançamentos', color: PDF.c.s2 });
  kpiCard(C, PDF.M + (w + gap) * 2, y, w, 28, { label: 'Saldo líquido', value: pMoney(R.tot.saldo), note: R.tot.saldo < 0 ? 'Déficit' : 'Superávit', color: R.tot.saldo < 0 ? PDF.c.danger : PDF.c.ok });
  const y2 = y + 32;
  kpiCard(C, PDF.M, y2, w, 28, { label: 'A receber do patrão', value: pMoney(R.recvTot.aReceber), note: `${R.recvTot.countAtrasado} em atraso, ${R.recvTot.countPendente} no prazo`, color: PDF.c.warn });
  kpiCard(C, PDF.M + w + gap, y2, w, 28, { label: 'Horas extras', value: sane(hours(R.tot.horasExtras)), note: `${pMoney(R.tot.extra)} no período`, color: PDF.c.s3 });
  kpiCard(C, PDF.M + (w + gap) * 2, y2, w, 28, { label: 'Benefícios', value: pMoney(R.tot.totalBeneficios), note: (R.tot.beneficios || []).length ? R.tot.beneficios.map(b => b.nome).join(', ') : 'Nenhum cadastrado', color: PDF.c.s4 });
  C.y = y2 + 36;
}

/** Análises automáticas — as mesmas que aparecem no painel. */
function drawInsights(C) {
  const list = (C.R.insights || []).slice(0, 6);
  if (!list.length) return;
  const { doc } = C;
  sectionTitle(C, 'Análises e Insights', 'Leituras automáticas do período', 28);
  const gap = 3.6, w = (PDF.CW - gap * 2) / 3;
  const tom = { bom: PDF.c.ok, ruim: PDF.c.danger, atencao: PDF.c.warn, neutro: PDF.c.a2 };
  list.forEach((i, idx) => {
    const col = idx % 3, lin = Math.floor(idx / 3);
    if (col === 0 && lin > 0) C.y += 26;
    if (col === 0) ensure(C, 26);
    const x = PDF.M + col * (w + gap), y = C.y;
    fill(doc, PDF.c.card); stroke(doc, PDF.c.border); doc.setLineWidth(.25);
    doc.roundedRect(x, y, w, 23, 2.6, 2.6, 'FD');
    fill(doc, tom[i.tom] || tom.neutro); doc.roundedRect(x, y + 3, 1.2, 17, .6, .6, 'F');
    font(doc, 6.5, 'bold'); ink(doc, PDF.c.t3);
    doc.text(sane(i.titulo.toUpperCase()), x + 5, y + 6.5);
    font(doc, 11, 'bold'); ink(doc, PDF.c.t1);
    let v = sane(i.valor);
    while (doc.getTextWidth(v) > w - 8 && v.length > 3) v = v.slice(0, -1);
    doc.text(v, x + 5, y + 13.5);
    font(doc, 6.8, 'normal'); ink(doc, PDF.c.t2);
    const linhas = doc.splitTextToSize(sane(i.nota), w - 9).slice(0, 2);
    doc.text(linhas, x + 5, y + 18);
  });
  C.y += 30;
}

function drawCharts(C, imgs) {
  const { doc } = C;
  sectionTitle(C, 'Análise Gráfica', 'Evolução, composição de receitas e despesas', 96);

  // Evolução — largura total
  const h1 = 74;
  ensure(C, h1 + 22);
  fill(doc, PDF.c.card); stroke(doc, PDF.c.border); doc.setLineWidth(.25);
  doc.roundedRect(PDF.M, C.y, PDF.CW, h1 + 20, 2.6, 2.6, 'FD');
  font(doc, 9, 'bold'); ink(doc, PDF.c.t1);
  doc.text('Evolução Mensal', PDF.M + 5, C.y + 7);
  doc.addImage(imgs.evolution, 'PNG', PDF.M + 2, C.y + 9, PDF.CW - 4, h1);
  // Legenda vetorial, abaixo da imagem (nunca sobre os rótulos do eixo)
  let lx = PDF.M + 5;
  [['Receita', PDF.c.s1], ['Despesa', PDF.c.s2], ['Saldo', PDF.c.s3]].forEach(([n, col]) => {
    fill(doc, col); doc.roundedRect(lx, C.y + h1 + 13, 2.6, 2.6, .8, .8, 'F');
    font(doc, 7.5, 'normal'); ink(doc, PDF.c.t2);
    doc.text(sane(n), lx + 4, C.y + h1 + 15.3);
    lx += doc.getTextWidth(sane(n)) + 12;
  });
  C.y += h1 + 25;

  // Duas colunas: despesas + receitas
  const gap = 4, cw = (PDF.CW - gap) / 2, ch = 56;
  const catLegend = (imgs.expenseCats || []).map(([c, v]) =>
    [c, PDF.c['s' + (EXPENSE_SLOT[EXPENSE_CATS.indexOf(c)] + 1)] || PDF.c.s6, pMoney(v)]);
  const revLegend = [['Salário', PDF.c.s1, pMoney(C.R.tot.salario)]]
    .concat((C.R.tot.beneficios || []).map(b => [b.nome, PDF.c.s1, pMoney(b.valor)]))
    .concat(C.R.tot.extra > 0 ? [['Hora Extra', PDF.c.s1, pMoney(C.R.tot.extra)]] : [])
    .slice(0, 6);
  // Legenda em 2 colunas: o painel fica mais baixo e cabe melhor na página.
  const legRows = n => Math.ceil(n / 2);
  const legH = Math.max(legRows(catLegend.length), legRows(revLegend.length)) * 4.6;
  const panelH = ch + 13 + legH;
  ensure(C, panelH + 4);          // reserva a altura REAL do bloco, não uma estimativa
  const y = C.y;

  const panel = (x, title, img, legend) => {
    fill(doc, PDF.c.card); stroke(doc, PDF.c.border); doc.setLineWidth(.25);
    doc.roundedRect(x, y, cw, panelH, 2.6, 2.6, 'FD');
    font(doc, 9, 'bold'); ink(doc, PDF.c.t1);
    doc.text(sane(title), x + 5, y + 7);
    if (img) doc.addImage(img, 'PNG', x + 2, y + 9, cw - 4, ch);
    if (legend) {
      const colW = (cw - 10) / 2;
      legend.forEach(([n, col, val], i) => {
        const lx = x + 5 + (i % 2) * colW;
        const ly = y + ch + 14 + Math.floor(i / 2) * 4.6;
        fill(doc, col); doc.roundedRect(lx, ly - 2.2, 2.4, 2.4, .7, .7, 'F');
        font(doc, 7, 'normal'); ink(doc, PDF.c.t2); doc.text(sane(n), lx + 4, ly);
        font(doc, 7, 'bold'); ink(doc, PDF.c.t1); doc.text(sane(val), lx + colW - 3, ly, { align: 'right' });
      });
    }
  };

  if (imgs.expenses) panel(PDF.M, 'Distribuição de Despesas', imgs.expenses, catLegend);
  else {
    fill(doc, PDF.c.card); stroke(doc, PDF.c.border); doc.roundedRect(PDF.M, y, cw, panelH, 2.6, 2.6, 'FD');
    font(doc, 9, 'bold'); ink(doc, PDF.c.t1); doc.text('Distribuição de Despesas', PDF.M + 5, y + 7);
    font(doc, 8.5, 'normal'); ink(doc, PDF.c.t3); doc.text('Nenhuma despesa no período.', PDF.M + 5, y + 20);
  }
  panel(PDF.M + cw + gap, 'Receita por Categoria', imgs.revenue, revLegend);

  C.y = y + panelH + 8;

  // Status de pagamentos do patrão
  if (imgs.status) {
    ensure(C, ch + 20);
    const ys = C.y;
    fill(doc, PDF.c.card); stroke(doc, PDF.c.border); doc.setLineWidth(.25);
    doc.roundedRect(PDF.M, ys, cw, ch + 12, 2.6, 2.6, 'FD');
    font(doc, 9, 'bold'); ink(doc, PDF.c.t1);
    doc.text('Status de Pagamentos do Patrão', PDF.M + 5, ys + 7);
    doc.addImage(imgs.status, 'PNG', PDF.M + 2, ys + 9, cw - 4, ch);

    // Painel de números ao lado
    const x2 = PDF.M + cw + gap;
    fill(doc, PDF.c.card); stroke(doc, PDF.c.border);
    doc.roundedRect(x2, ys, cw, ch + 12, 2.6, 2.6, 'FD');
    font(doc, 9, 'bold'); ink(doc, PDF.c.t1);
    doc.text('Situação Consolidada', x2 + 5, ys + 7);
    let ly = ys + 18;
    [['Pago', C.R.recvTot.pago, PDF.c.ok, C.R.recvTot.countPago],
     ['Pendente no prazo', C.R.recvTot.pendente, PDF.c.warn, C.R.recvTot.countPendente],
     ['Atrasado', C.R.recvTot.atrasado, PDF.c.danger, C.R.recvTot.countAtrasado]].forEach(([n, v, col, ct]) => {
      fill(doc, col); doc.circle(x2 + 6.2, ly - 1.1, 1.3, 'F');
      font(doc, 8.5, 'normal'); ink(doc, PDF.c.t2); doc.text(sane(n), x2 + 9.5, ly);
      font(doc, 8.5, 'bold'); ink(doc, PDF.c.t1); doc.text(pMoney(v), x2 + cw - 5, ly, { align: 'right' });
      font(doc, 7, 'normal'); ink(doc, PDF.c.t3); doc.text(sane(`${ct} lançamento(s)`), x2 + 9.5, ly + 4);
      ly += 13;
    });
    C.y = ys + ch + 18;
  }
}

function drawTransactions(C) {
  const R = C.R;
  sectionTitle(C, 'Lançamentos do Período', `${R.lancamentos.length} registro(s) entre ${C.periodLabel}`, tblReserve(R.lancamentos.length, 2));
  if (!R.lancamentos.length) {
    font(C.doc, 9, 'normal'); ink(C.doc, PDF.c.t3);
    C.doc.text('Nenhum lançamento no período selecionado.', PDF.M, C.y); C.y += 10; return;
  }
  const totalIn = R.lancamentos.filter(t => KINDS[t.kind]?.flow === 'in').reduce((s, t) => s + num(t.valor), 0);
  const totalOut = R.lancamentos.filter(t => KINDS[t.kind]?.flow === 'out').reduce((s, t) => s + num(t.valor), 0);

  table(C, [
    { title: 'Data', w: 22, get: t => fmtDate(t.data), color: () => PDF.c.t2 },
    { title: 'Descrição', w: 52, get: t => t.descricao || KINDS[t.kind]?.label || '-' },
    { title: 'Tipo', w: 28, get: t => KINDS[t.kind]?.label || t.kind, color: () => PDF.c.t2 },
    { title: 'Categoria', w: 28, get: t => t.categoria || '-', color: () => PDF.c.t2 },
    { title: 'Valor', w: 30, align: 'right', bold: true, get: t => (KINDS[t.kind]?.flow === 'in' ? '+ ' : '- ') + pMoney(Math.abs(num(t.valor))), color: t => KINDS[t.kind]?.flow === 'in' ? PDF.c.ok : PDF.c.danger },
    { title: 'Status', w: 22, align: 'right', get: t => (t.status === 'pendente' ? 'Pendente' : 'Pago'), color: t => t.status === 'pendente' ? PDF.c.warn : PDF.c.t2 },
  ], R.lancamentos, [
    // Duas linhas de rodapé: entradas/saídas e o saldo. Ficam grudadas na tabela,
    // então nunca sobra uma linha órfã no topo da página seguinte.
    [null, { text: 'Entradas e saídas', color: PDF.c.t3 }, null, null,
     { text: '+ ' + pMoney(totalIn), color: PDF.c.ok },
     { text: '- ' + pMoney(totalOut), color: PDF.c.danger }],
    [null, { text: 'Saldo do período' }, null, null,
     { text: pMoney(totalIn - totalOut), color: totalIn - totalOut < 0 ? PDF.c.danger : PDF.c.ok },
     null],
  ]);
}

function drawReceivables(C) {
  const R = C.R;
  sectionTitle(C, 'A Receber do Patrão', 'Pendências e dias de atraso apurados na data de emissão', tblReserve(R.receivables.length, 1));
  if (!R.receivables.length) {
    font(C.doc, 9, 'normal'); ink(C.doc, PDF.c.t3);
    C.doc.text('Nenhuma pendência registrada no período.', PDF.M, C.y); C.y += 10; return;
  }
  const stColor = s => s === 'pago' ? PDF.c.ok : s === 'atrasado' ? PDF.c.danger : PDF.c.warn;
  const stName = s => s === 'pago' ? 'Pago' : s === 'atrasado' ? 'Atrasado' : 'Pendente';
  table(C, [
    { title: 'Descrição', w: 48, get: t => t.descricao || 'Pendência' },
    { title: 'Referente a', w: 26, get: t => t.categoria || '-', color: () => PDF.c.t2 },
    { title: 'Previsto', w: 23, get: t => fmtDate(t.dataPrevista || t.data), color: () => PDF.c.t2 },
    { title: 'Pago em', w: 23, get: t => t.dataPagamento ? fmtDate(t.dataPagamento) : '-', color: () => PDF.c.t2 },
    { title: 'Valor', w: 28, align: 'right', bold: true, get: t => pMoney(t.valor) },
    { title: 'Situação', w: 34, align: 'right', get: t => t._late ? `${stName(t._status)} - ${t._late} dia(s)` : stName(t._status), color: t => stColor(t._status) },
  ], R.receivables, [
    { text: 'Total pendente' }, null, null, null,
    { text: pMoney(R.recvTot.aReceber), color: PDF.c.warn },
    { text: `${R.recvTot.countAtrasado} atrasado(s)`, color: PDF.c.danger },
  ]);
}

function drawDetail(C) {
  const R = C.R;
  sectionTitle(C, 'Detalhamento: Salário, Benefícios e Horas Extras', 'Memória de cálculo mês a mês', tblReserve(R.months.length, 1));

  table(C, [
    { title: 'Mês', w: 34, get: m => monthLabelLong(m.key) },
    { title: 'Salário', w: 27, align: 'right', get: m => pMoney(m.salario), color: () => PDF.c.t2 },
    { title: 'Cobertura', w: 25, align: 'right', get: m => m.cobertura ? `${m.cobertura.dias}/${m.cobertura.totalDias} dias` : '-', color: m => (m.cobertura && m.cobertura.parcial) ? PDF.c.warn : PDF.c.t3 },
    { title: 'Benefícios', w: 27, align: 'right', get: m => pMoney(m.totalBeneficios), color: () => PDF.c.t2 },
    { title: 'H. Extras', w: 20, align: 'right', get: m => sane(hours(m.horasExtras)), color: () => PDF.c.t2 },
    { title: 'Valor extras', w: 26, align: 'right', get: m => pMoney(m.extra), color: () => PDF.c.ok },
    { title: 'Descontos', w: 23, align: 'right', get: m => m.descontos ? '- ' + pMoney(m.descontos) : '-', color: m => m.descontos ? PDF.c.danger : PDF.c.t3 },
  ], R.months, [
    { text: 'Período' },
    { text: pMoney(R.tot.salario) },
    null,
    { text: pMoney(R.tot.totalBeneficios) },
    { text: sane(hours(R.tot.horasExtras)) },
    { text: pMoney(R.tot.extra), color: PDF.c.ok },
    { text: R.tot.descontos ? '- ' + pMoney(R.tot.descontos) : '-', color: R.tot.descontos ? PDF.c.danger : PDF.c.t3 },
  ]);

  // Períodos de salário vigentes no intervalo — a origem dos números acima.
  const vig = (R.salaries || []).filter(v => (v.inicio || '') <= R.to && (!v.fim || v.fim >= R.from));
  if (vig.length) {
    ensure(C, 22);
    font(C.doc, 9, 'bold'); ink(C.doc, PDF.c.t1);
    C.doc.text('Períodos de salário considerados', PDF.M, C.y); C.y += 6;
    table(C, [
      { title: 'A partir de', w: 26, get: v => fmtDate(v.inicio), color: () => PDF.c.t2 },
      { title: 'Até', w: 28, get: v => v.fim ? fmtDate(v.fim) : 'Até o momento', color: v => v.fim ? PDF.c.t2 : PDF.c.ok },
      { title: 'Salário', w: 28, align: 'right', bold: true, get: v => pMoney(v.valor) },
      { title: 'Benefícios', w: 100, get: v => (v.beneficios || []).length
          ? v.beneficios.map(b => `${b.nome} ${pMoney(b.valor)}${freqLabel(b.frequencia)}`).join('; ') : '-',
        color: () => PDF.c.t2 },
    ], vig);
  }

  // Lançamentos de hora extra e liberamento, um a um
  const detail = Repo.all().filter(t => (t.kind === 'hora_extra' || t.kind === 'liberamento' || t.kind === 'vt')
    && t.data >= R.from && t.data <= R.to).sort((a, b) => a.data.localeCompare(b.data));
  if (detail.length) {
    ensure(C, 22);
    font(C.doc, 9, 'bold'); ink(C.doc, PDF.c.t1);
    C.doc.text('Lançamentos individuais', PDF.M, C.y); C.y += 6;
    table(C, [
      { title: 'Data', w: 24, get: t => fmtDate(t.data), color: () => PDF.c.t2 },
      { title: 'Tipo', w: 34, get: t => KINDS[t.kind]?.label || t.kind },
      { title: 'Descrição', w: 58, get: t => t.descricao || '-', color: () => PDF.c.t2 },
      { title: 'Horas', w: 24, align: 'right', get: t => t.horas ? sane(`${hours(t.horas)} x ${money(t.valorHora)}`) : '-', color: () => PDF.c.t2 },
      { title: 'Valor', w: 30, align: 'right', bold: true, get: t => (KINDS[t.kind]?.flow === 'in' ? '+ ' : '- ') + pMoney(Math.abs(num(t.valor))), color: t => KINDS[t.kind]?.flow === 'in' ? PDF.c.ok : PDF.c.danger },
    ], detail);
  }
}

/* ---- 20.6 Orquestração ----------------------------------------------------------- */

async function generatePdf(e) {
  e.preventDefault();
  const btn = $('#pdfSubmit');
  const from = $('#pdfFrom').value, to = $('#pdfTo').value;
  if (!from || !to || from > to) return toast('Verifique as datas: a inicial precisa ser anterior à final.', 'err');

  const opts = {
    kpis: $('#pdfKpis').checked, charts: $('#pdfCharts').checked, table: $('#pdfTable').checked,
    recv: $('#pdfRecv').checked, detail: $('#pdfDetail').checked,
  };
  const filename = ($('#pdfName').value || `relatorio-financeiro-${from.slice(0, 7)}.pdf`).replace(/\.pdf$/i, '') + '.pdf';

  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span style="width:13px;height:13px;border:2px solid color-mix(in srgb, currentColor 30%, transparent);border-top-color:currentColor;border-radius:50%;display:inline-block;animation:spin .7s linear infinite"></span> Gerando…';
  if (!$('#spinKf')) {
    const s = document.createElement('style'); s.id = 'spinKf';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }

  try {
    const R = buildReport(from, to);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    doc.setProperties({
      title: 'Relatório Financeiro', subject: `Período ${fmtDate(from)} a ${fmtDate(to)}`,
      creator: 'Financial Analytics',
    });
    const C = makeCtx(doc, R, opts);

    drawCover(C);
    newPage(C);

    if (opts.kpis) { drawKpis(C); drawInsights(C); }
    if (opts.charts) drawCharts(C, await reportCharts(R));
    if (opts.table) drawTransactions(C);
    if (opts.recv) drawReceivables(C);
    if (opts.detail) drawDetail(C);

    // Numeração: só agora sabemos o total de páginas
    const total = doc.getNumberOfPages();
    for (let i = 2; i <= total; i++) {
      doc.setPage(i);
      font(doc, 8, 'normal'); ink(doc, PDF.c.t3);
      doc.text(sane(`Página ${i - 1} de ${total - 1}`), PDF.W - PDF.M, PDF.H - 9, { align: 'right' });
    }

    doc.save(filename);
    closeModal('#ovPdf');
    toast(`Relatório gerado: ${filename}`);
  } catch (err) {
    console.error(err);
    toast('Falha ao gerar o PDF: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}
