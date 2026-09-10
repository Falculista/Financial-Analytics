/* ==================================================================================
   FINANCIAL ANALYTICS — Controle Financeiro Pessoal
   ----------------------------------------------------------------------------------
   Arquitetura em 4 camadas, pensada para receber um backend com login depois:

     1. STORAGE ADAPTER  — fala com a fonte de dados. Hoje: localStorage.
                            Amanhã: ApiAdapter (fetch + JWT). Trocar aqui e pronto.
     2. REPOSITORY       — regras de persistência (ids, timestamps, userId).
     3. CALC             — motor financeiro puro (funções sem efeito colateral).
     4. UI               — render de KPIs, gráficos, tabelas, modais e PDF.

   Nenhuma camada acima acessa localStorage diretamente. Isso é intencional.
   ================================================================================== */

/* ==================================================================================
   0. CONSTANTES E DOMÍNIO
   ================================================================================== */

const APP = { version: '2.0.0', storageKey: 'finapp:v1' };

/** Tipos de lançamento. `flow` diz se entra ou sai do bolso. */
const KINDS = {
  despesa:     { label: 'Despesa',        flow: 'out', icon: 'card',   desc: 'Gasto por categoria' },
  hora_extra:  { label: 'Hora extra',     flow: 'in',  icon: 'clock',  desc: 'Horas × valor da hora' },
  liberamento: { label: 'Liberamento',    flow: 'out', icon: 'minus',  desc: 'Horas não trabalhadas (desconto)' },
  receita:     { label: 'Receita extra',  flow: 'in',  icon: 'plus',   desc: 'Entrada fora do salário' },
  a_receber:   { label: 'A receber',      flow: 'in',  icon: 'hand',   desc: 'O patrão ainda deve' },
  vt:          { label: 'Ajuste de benefício', flow: 'in', icon: 'bus', desc: 'Correção pontual de VT, VR…' },
};

/** Categorias de despesa — ordem fixa: define a cor de cada fatia do donut. */
const EXPENSE_CATS = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Outros'];

/**
 * Slot de cor de cada categoria de despesa (índice em --s1..--s6).
 * O donut é um anel: a última fatia encosta na primeira. Por isso "Outros" usa o
 * slot 6 (vermelho) e não o 5 (azul) — azul ao lado de violeta fica indistinguível
 * para quem tem daltonismo. Esta ordem foi validada nos temas claro e escuro.
 */
const EXPENSE_SLOT = [0, 1, 2, 3, 5];

/** Categorias de receita extra (lançamento manual, fora do salário). */
const EXTRA_REVENUE_CATS = ['Outras receitas', 'Bônus', 'Reembolso', '13º salário', 'Férias', 'Venda'];

/** Categorias de receita usadas no filtro (agrupam o que o painel calcula sozinho). */
const REVENUE_FILTER_CATS = ['Hora Extra', 'Benefícios', ...EXTRA_REVENUE_CATS];

/** Subtipos de pendência do patrão. */
const RECV_KINDS = ['Hora extra', 'Benefício', 'Salário', 'Outro'];

/* ---- Benefícios ------------------------------------------------------------------
   Um benefício é um valor que ENTRA junto do salário. A frequência diz como ele se
   transforma em dinheiro no mês:
     mes      → valor cheio no mês (proporcional aos dias, se o período for parcial)
     semana   → valor × número de semanas trabalhadas (contadas pelas segundas-feiras)
     dia_util → valor × número de dias úteis (segunda a sexta) dentro do período
   ---------------------------------------------------------------------------------- */
const BENEFIT_PRESETS = [
  { nome: 'Vale Transporte',   frequencia: 'semana' },
  { nome: 'Vale Refeição',     frequencia: 'dia_util' },
  { nome: 'Vale Alimentação',  frequencia: 'mes' },
  { nome: 'Cesta Básica',      frequencia: 'mes' },
  { nome: 'Auxílio Combustível', frequencia: 'mes' },
  { nome: 'Auxílio Home Office', frequencia: 'mes' },
  { nome: 'Ajuda de Custo',    frequencia: 'mes' },
  { nome: 'Gratificação',      frequencia: 'mes' },
  { nome: 'Adicional Noturno', frequencia: 'mes' },
  { nome: 'Adicional de Periculosidade', frequencia: 'mes' },
  { nome: 'Adicional de Insalubridade',  frequencia: 'mes' },
  { nome: 'Prêmio / Bônus fixo', frequencia: 'mes' },
];

const FREQUENCIES = [
  { id: 'mes',      label: 'Por mês',      curto: '/mês' },
  { id: 'semana',   label: 'Por semana',   curto: '/semana' },
  { id: 'dia_util', label: 'Por dia útil', curto: '/dia útil' },
];
const freqLabel = id => (FREQUENCIES.find(f => f.id === id) || FREQUENCIES[0]).curto;

const DEFAULT_SETTINGS = {
  theme: 'dark',
  ultimoValorHora: 10,   // pré-preenche o campo ao lançar hora extra / liberamento
};

/* ==================================================================================
   1. STORAGE ADAPTER
   ----------------------------------------------------------------------------------
   Interface assíncrona de propósito. Quando o backend existir, basta escrever um
   ApiAdapter com os mesmos métodos e trocar a linha do `Repo.adapter`.
   ================================================================================== */

const LocalStorageAdapter = {
  name: 'localStorage',

  _read() {
    try {
      const raw = localStorage.getItem(APP.storageKey);
      if (!raw) return { transactions: [], salaries: [], settings: { ...DEFAULT_SETTINGS } };
      const parsed = JSON.parse(raw);
      return {
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        salaries: Array.isArray(parsed.salaries) ? parsed.salaries : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      };
    } catch (e) {
      console.warn('[storage] falha ao ler, começando vazio:', e);
      return { transactions: [], salaries: [], settings: { ...DEFAULT_SETTINGS } };
    }
  },
  _write(db) {
    try { localStorage.setItem(APP.storageKey, JSON.stringify(db)); return true; }
    catch (e) { console.error('[storage] falha ao gravar:', e); return false; }
  },

  async listTransactions() { return this._read().transactions; },
  async saveTransactions(list) { const db = this._read(); db.transactions = list; return this._write(db); },
  async listSalaries() { return this._read().salaries; },
  async saveSalaries(list) { const db = this._read(); db.salaries = list; return this._write(db); },
  async getSettings() { return this._read().settings; },
  async saveSettings(s) { const db = this._read(); db.settings = s; return this._write(db); },
  async clear() { return this._write({ transactions: [], salaries: [], settings: { ...DEFAULT_SETTINGS } }); },
};

/* ----------------------------------------------------------------------------------
   ApiAdapter (esqueleto para a fase com backend + login).
   Mesmos métodos, mesma assinatura — a UI não muda uma linha.

   const ApiAdapter = {
     name: 'api',
     base: '/api',
     _headers() {
       return { 'Content-Type': 'application/json',
                Authorization: 'Bearer ' + Session.getToken() };
     },
     async listTransactions() {
       const r = await fetch(`${this.base}/transactions`, { headers: this._headers() });
       if (!r.ok) throw new Error('HTTP ' + r.status);
       return r.json();
     },
     async saveTransactions(list) { ... PUT /transactions/bulk ... },
     async listSalaries()         { ... GET /salaries ... },
     async saveSalaries(list)     { ... PUT /salaries/bulk ... },
     async getSettings()          { ... GET /settings ... },
     async saveSettings(s)        { ... PUT /settings ... },
     async clear()                { ... DELETE /data ... },
   };
   ---------------------------------------------------------------------------------- */

/* ==================================================================================
   2. REPOSITORY
   ----------------------------------------------------------------------------------
   Cuida de id, timestamps e userId. Todo registro já nasce no formato que o
   backend vai esperar, então a migração não pede migração de dados.
   ================================================================================== */

const Repo = {
  adapter: LocalStorageAdapter,   // <-- trocar por ApiAdapter no dia do backend
  cache: { transactions: [], salaries: [], settings: { ...DEFAULT_SETTINGS } },

  /** Usuário corrente. Sem login ainda: um único usuário local. */
  currentUserId() { return 'local-user'; },

  newId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  },

  async load() {
    this.cache.transactions = await this.adapter.listTransactions();
    this.cache.salaries = await this.adapter.listSalaries();
    this.cache.settings = await this.adapter.getSettings();
    await this.migrate();
    return this.cache;
  },

  /**
   * Compatibilidade com backups da v1, que guardavam um salário fixo e um VT
   * semanal nas Configurações. Vira um período que começa no mês corrente — e não
   * no início do histórico, que faria o painel somar salário em meses nos quais
   * o valor ainda não valia.
   */
  async migrate() {
    const s = this.cache.settings;
    if (this.cache.salaries.length || !num(s.salarioMensal)) return;
    const d = new Date();
    await this.saveSalary({
      valor: num(s.salarioMensal),
      inicio: isoOf(new Date(d.getFullYear(), d.getMonth(), 1)),
      fim: null,
      beneficios: num(s.vtSemanal)
        ? [{ nome: 'Vale Transporte', valor: num(s.vtSemanal), frequencia: 'semana' }] : [],
      observacao: 'Importado das Configurações antigas — confira a data de início.',
    });
    await this.saveSettings({
      ultimoValorHora: num(s.valorHoraExtra) || 10,
      salarioMensal: undefined, vtSemanal: undefined, valorHoraExtra: undefined,
      diaPagamento: undefined, overrides: undefined,
    });
    this._migrated = true;
  },

  all() { return this.cache.transactions; },
  salaries() { return this.cache.salaries.slice().sort((a, b) => (a.inicio || '').localeCompare(b.inicio || '')); },
  settings() { return this.cache.settings; },

  /** Normaliza um lançamento vindo do formulário ou de um import. */
  normalize(tx) {
    const now = new Date().toISOString();
    const horas = num(tx.horas);
    const valorHora = num(tx.valorHora) || num(this.settings().ultimoValorHora);
    const t = {
      id: tx.id || this.newId(),
      userId: tx.userId || this.currentUserId(),
      kind: tx.kind,
      descricao: (tx.descricao || '').trim(),
      categoria: tx.categoria || '',
      valor: round2(num(tx.valor)),
      horas: horas || null,
      valorHora: null,
      data: tx.data || todayISO(),
      dataPrevista: tx.dataPrevista || null,
      dataPagamento: tx.dataPagamento || null,
      status: tx.status || 'pago',
      observacao: (tx.observacao || '').trim(),
      createdAt: tx.createdAt || now,
      updatedAt: now,
    };
    // Lançamentos por hora guardam a própria taxa: o histórico não muda quando o
    // valor da hora for reajustado no futuro.
    if (t.kind === 'hora_extra' || t.kind === 'liberamento') {
      t.valorHora = round2(valorHora);
      t.valor = round2((t.horas || 0) * t.valorHora);
    }
    if (t.kind === 'a_receber') {
      t.status = tx.status === 'pago' ? 'pago' : 'pendente';
      t.dataPrevista = tx.dataPrevista || t.data;
    }
    return t;
  },

  async save(tx) {
    const t = this.normalize(tx);
    const list = this.all();
    const i = list.findIndex(x => x.id === t.id);
    if (i >= 0) { t.createdAt = list[i].createdAt; list[i] = t; }
    else list.push(t);
    await this.adapter.saveTransactions(list);
    if (t.valorHora) await this.saveSettings({ ultimoValorHora: t.valorHora });
    return t;
  },

  async remove(id) {
    this.cache.transactions = this.all().filter(t => t.id !== id);
    await this.adapter.saveTransactions(this.cache.transactions);
  },

  async replaceAll(list) {
    this.cache.transactions = list.map(t => this.normalize(t));
    await this.adapter.saveTransactions(this.cache.transactions);
  },

  /* ---- Períodos de salário ---- */

  normalizeSalary(s) {
    const now = new Date().toISOString();
    return {
      id: s.id || this.newId(),
      userId: s.userId || this.currentUserId(),
      valor: round2(num(s.valor)),
      inicio: s.inicio || todayISO(),
      fim: s.fim || null,                     // null = "até o momento"
      beneficios: (Array.isArray(s.beneficios) ? s.beneficios : [])
        .filter(b => b && b.nome && num(b.valor) > 0)
        .map(b => ({
          nome: String(b.nome).trim(),
          valor: round2(num(b.valor)),
          frequencia: FREQUENCIES.some(f => f.id === b.frequencia) ? b.frequencia : 'mes',
        })),
      observacao: (s.observacao || '').trim(),
      createdAt: s.createdAt || now,
      updatedAt: now,
    };
  },

  async saveSalary(s) {
    const v = this.normalizeSalary(s);
    const list = this.cache.salaries;
    const i = list.findIndex(x => x.id === v.id);
    if (i >= 0) { v.createdAt = list[i].createdAt; list[i] = v; }
    else list.push(v);
    await this.adapter.saveSalaries(list);
    return v;
  },

  async removeSalary(id) {
    this.cache.salaries = this.cache.salaries.filter(s => s.id !== id);
    await this.adapter.saveSalaries(this.cache.salaries);
  },

  async replaceSalaries(list) {
    this.cache.salaries = (list || []).map(s => this.normalizeSalary(s));
    await this.adapter.saveSalaries(this.cache.salaries);
  },

  async saveSettings(patch) {
    this.cache.settings = { ...this.cache.settings, ...patch };
    Object.keys(this.cache.settings).forEach(k => {
      if (this.cache.settings[k] === undefined) delete this.cache.settings[k];
    });
    await this.adapter.saveSettings(this.cache.settings);
  },

  async wipe() {
    await this.adapter.clear();
    this.cache = { transactions: [], salaries: [], settings: { ...DEFAULT_SETTINGS } };
    await this.load();
  },
};

/* ==================================================================================
   3. HELPERS DE NÚMERO, DATA E FORMATAÇÃO (pt-BR)
   ================================================================================== */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRLc = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const NUM2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const money = n => BRL.format(round2(num(n)));
const moneyShort = n => Math.abs(n) >= 1000 ? BRLc.format(n) : BRL.format(n);
/** Rótulo de eixo: sempre sem centavos, para não misturar "R$ 0,00" com "R$ 2.000". */
const moneyAxis = n => BRLc.format(round2(num(n)));
const hours = h => NUM2.format(num(h)).replace(',00', '') + 'h';
const pct = (a, b) => (!b ? 0 : (a / b) * 100);
const pctTxt = (a, b, dec = 0) => `${pct(a, b).toFixed(dec).replace('.', ',')}%`;

function todayISO() { const d = new Date(); return isoOf(d); }
function isoOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function pad(n) { return String(n).padStart(2, '0'); }

/** Converte 'YYYY-MM-DD' em Date LOCAL (sem o deslocamento de fuso do `new Date(str)`). */
function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function fmtDate(s) { const d = parseISO(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—'; }
function monthKey(s) { return String(s || '').slice(0, 7); }          // 'YYYY-MM'
function monthKeyOf(y, m) { return `${y}-${pad(m + 1)}`; }            // m = 0..11
function monthLabel(key) { const [y, m] = key.split('-').map(Number); return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`; }
function monthLabelLong(key) { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} de ${y}`; }
function monthStart(key) { return key + '-01'; }
function monthEnd(key) { const [y, m] = key.split('-').map(Number); return isoOf(new Date(y, m, 0)); }

/** Diferença em dias entre duas datas ISO (b − a), ignorando horas. */
function daysBetween(aISO, bISO) {
  const a = parseISO(aISO), b = parseISO(bISO);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

/* ==================================================================================
   4. CALC — MOTOR FINANCEIRO
   ----------------------------------------------------------------------------------
   Funções puras: recebem dados, devolvem números. Nenhuma toca no DOM nem no
   storage — é isso que permite testá-las e reaproveitá-las no backend.
   ================================================================================== */

const Calc = {

  /* --------------------------------------------------------------------------------
     COBERTURA DE UM PERÍODO DENTRO DE UM MÊS
     --------------------------------------------------------------------------------
     Um período de salário vale de `inicio` até `fim` (ou até hoje, se `fim` for null).
     Para saber quanto ele rende num mês, primeiro descobrimos qual fatia do mês ele
     cobre. É isso que impede o painel de somar salário em meses anteriores à
     contratação — o problema que existia quando o salário era um valor fixo global.
     -------------------------------------------------------------------------------- */
  coverage(key, vigencia) {
    const mStart = monthStart(key), mEnd = monthEnd(key);
    const from = (vigencia.inicio || mStart) > mStart ? vigencia.inicio : mStart;
    const to   = vigencia.fim && vigencia.fim < mEnd ? vigencia.fim : mEnd;
    if (from > to) return null;                       // o período não toca este mês
    const totalDias = parseISO(mEnd).getDate();
    const dias = daysBetween(from, to) + 1;           // inclusivo nas duas pontas
    return { from, to, dias, totalDias, parcial: dias < totalDias, fracao: dias / totalDias };
  },

  /** Segundas-feiras entre duas datas — uma por semana de trabalho iniciada. */
  mondaysBetween(fromISO, toISO) {
    let n = 0;
    const d = parseISO(fromISO), end = parseISO(toISO);
    if (!d || !end) return 0;
    while (d <= end) { if (d.getDay() === 1) n++; d.setDate(d.getDate() + 1); }
    return n;
  },

  /** Dias úteis (segunda a sexta) entre duas datas. */
  businessDaysBetween(fromISO, toISO) {
    let n = 0;
    const d = parseISO(fromISO), end = parseISO(toISO);
    if (!d || !end) return 0;
    while (d <= end) { const w = d.getDay(); if (w >= 1 && w <= 5) n++; d.setDate(d.getDate() + 1); }
    return n;
  },

  /** Quanto um benefício rende dentro de uma cobertura. */
  benefitValue(b, cov) {
    const v = num(b.valor);
    if (b.frequencia === 'semana')   return round2(v * this.mondaysBetween(cov.from, cov.to));
    if (b.frequencia === 'dia_util') return round2(v * this.businessDaysBetween(cov.from, cov.to));
    return round2(v * cov.fracao);                    // mensal: proporcional aos dias
  },

  /* --------------------------------------------------------------------------------
     GANHOS FIXOS DO MÊS (salário + benefícios de todos os períodos que o tocam)
     -------------------------------------------------------------------------------- */
  monthEarnings(key, salaries) {
    const out = { salario: 0, beneficios: [], totalBeneficios: 0, cobertura: null, periodos: [] };
    const mapa = new Map();

    (salaries || []).forEach(v => {
      const cov = this.coverage(key, v);
      if (!cov) return;
      const salario = round2(num(v.valor) * cov.fracao);
      out.salario = round2(out.salario + salario);
      out.periodos.push({ vigencia: v, cobertura: cov, salario });
      (v.beneficios || []).forEach(b => {
        const valor = this.benefitValue(b, cov);
        if (!valor) return;
        mapa.set(b.nome, round2((mapa.get(b.nome) || 0) + valor));
      });
      // cobertura agregada: usada só para explicar "x de y dias" no card
      if (!out.cobertura) out.cobertura = { ...cov };
      else {
        out.cobertura.dias = Math.min(cov.totalDias, out.cobertura.dias + cov.dias);
        out.cobertura.parcial = out.cobertura.dias < cov.totalDias;
      }
    });

    out.beneficios = [...mapa.entries()].map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
    out.totalBeneficios = round2(out.beneficios.reduce((s, b) => s + b.valor, 0));
    return out;
  },

  /* REGRA HORA EXTRA — cada lançamento guarda a própria taxa: horas × valor da hora */
  overtimeHours(key, txs) {
    return round2(txs.filter(t => t.kind === 'hora_extra' && monthKey(t.data) === key)
                     .reduce((s, t) => s + num(t.horas), 0));
  },
  overtimeValue(key, txs) {
    return round2(txs.filter(t => t.kind === 'hora_extra' && monthKey(t.data) === key)
                     .reduce((s, t) => s + num(t.valor), 0));
  },

  /* REGRA LIBERAMENTO — horas não trabalhadas viram desconto na receita do mês */
  releaseHours(key, txs) {
    return round2(txs.filter(t => t.kind === 'liberamento' && monthKey(t.data) === key)
                     .reduce((s, t) => s + num(t.horas), 0));
  },
  releaseValue(key, txs) {
    return round2(txs.filter(t => t.kind === 'liberamento' && monthKey(t.data) === key)
                     .reduce((s, t) => s + num(t.valor), 0));
  },

  /** Receitas extras lançadas à mão + ajustes de benefício. */
  otherRevenue(key, txs) {
    return round2(txs.filter(t => (t.kind === 'receita' || t.kind === 'vt') && monthKey(t.data) === key)
                     .reduce((s, t) => s + num(t.valor), 0));
  },

  /** Despesas do mês, com filtro opcional de categoria. */
  expenses(key, txs, categoria) {
    return round2(txs.filter(t => t.kind === 'despesa' && monthKey(t.data) === key
                                  && (!categoria || t.categoria === categoria))
                     .reduce((s, t) => s + num(t.valor), 0));
  },

  /** Despesas quebradas por categoria (ordem fixa das categorias). */
  expensesByCategory(keys, txs) {
    const set = new Set([].concat(keys));
    const map = new Map(EXPENSE_CATS.map(c => [c, 0]));
    txs.filter(t => t.kind === 'despesa' && set.has(monthKey(t.data))).forEach(t => {
      const c = EXPENSE_CATS.includes(t.categoria) ? t.categoria : 'Outros';
      map.set(c, round2(map.get(c) + num(t.valor)));
    });
    return map;
  },

  /* --------------------------------------------------------------------------------
     RESUMO DO MÊS
     receita = salário + benefícios + horas extras + receitas extras − liberamentos
     saldo   = receita − despesas
     -------------------------------------------------------------------------------- */
  monthSummary(key, txs, salaries) {
    const g = this.monthEarnings(key, salaries);
    const extra     = this.overtimeValue(key, txs);
    const outras    = this.otherRevenue(key, txs);
    const descontos = this.releaseValue(key, txs);
    const receita   = round2(g.salario + g.totalBeneficios + extra + outras - descontos);
    const despesa   = this.expenses(key, txs);
    return {
      key,
      salario: g.salario,
      beneficios: g.beneficios,
      totalBeneficios: g.totalBeneficios,
      cobertura: g.cobertura,
      extra, outras, descontos,
      receita, despesa,
      saldo: round2(receita - despesa),
      horasExtras: this.overtimeHours(key, txs),
      horasLiberadas: this.releaseHours(key, txs),
    };
  },

  /** Soma vários meses num único resumo (usado quando o período é o ano todo). */
  rangeSummary(keys, txs, salaries) {
    const months = keys.map(k => this.monthSummary(k, txs, salaries));
    const mapa = new Map();
    months.forEach(m => m.beneficios.forEach(b =>
      mapa.set(b.nome, round2((mapa.get(b.nome) || 0) + b.valor))));
    const acc = months.reduce((a, m) => ({
      salario: round2(a.salario + m.salario),
      totalBeneficios: round2(a.totalBeneficios + m.totalBeneficios),
      extra: round2(a.extra + m.extra),
      outras: round2(a.outras + m.outras),
      descontos: round2(a.descontos + m.descontos),
      receita: round2(a.receita + m.receita),
      despesa: round2(a.despesa + m.despesa),
      saldo: round2(a.saldo + m.saldo),
      horasExtras: round2(a.horasExtras + m.horasExtras),
      horasLiberadas: round2(a.horasLiberadas + m.horasLiberadas),
    }), { salario: 0, totalBeneficios: 0, extra: 0, outras: 0, descontos: 0,
          receita: 0, despesa: 0, saldo: 0, horasExtras: 0, horasLiberadas: 0 });
    acc.beneficios = [...mapa.entries()].map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
    acc.months = months;
    acc.keys = keys;
    return acc;
  },

  /** Série dos últimos N meses terminando em `key` (para o gráfico de evolução). */
  series(key, n, txs, salaries) {
    const [y, m] = key.split('-').map(Number);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      out.push(this.monthSummary(monthKeyOf(d.getFullYear(), d.getMonth()), txs, salaries));
    }
    return out;
  },

  /* --------------------------------------------------------------------------------
     REGRA DE ATRASO
     Um valor a receber é "atrasado" quando data_prevista < hoje e status ≠ pago.
     Essa marcação é derivada — nunca gravada — para nunca ficar desatualizada.
     -------------------------------------------------------------------------------- */
  receivableStatus(t, today = todayISO()) {
    if (t.status === 'pago') return 'pago';
    const prev = t.dataPrevista || t.data;
    return (prev && prev < today) ? 'atrasado' : 'pendente';
  },
  daysLate(t, today = todayISO()) {
    if (this.receivableStatus(t, today) !== 'atrasado') return 0;
    return Math.max(0, daysBetween(t.dataPrevista || t.data, today));
  },

  /** Pendências do patrão dentro de um intervalo (ou todas, se sem intervalo). */
  receivables(txs, { from, to } = {}) {
    return txs.filter(t => t.kind === 'a_receber')
      .filter(t => {
        const ref = t.dataPrevista || t.data;
        return (!from || ref >= from) && (!to || ref <= to);
      })
      .map(t => ({ ...t, _status: this.receivableStatus(t), _late: this.daysLate(t) }))
      .sort((a, b) => (a.dataPrevista || a.data).localeCompare(b.dataPrevista || b.data));
  },

  /** Totais por status de pagamento do patrão (gráfico de barras). */
  receivableTotals(txs, range) {
    const r = this.receivables(txs, range);
    const t = { pago: 0, pendente: 0, atrasado: 0, countPago: 0, countPendente: 0, countAtrasado: 0, diasAtraso: [] };
    r.forEach(x => {
      t[x._status] = round2(t[x._status] + num(x.valor));
      t['count' + x._status[0].toUpperCase() + x._status.slice(1)]++;
      if (x._late) t.diasAtraso.push(x._late);
    });
    t.aReceber = round2(t.pendente + t.atrasado);
    t.atrasoMedio = t.diasAtraso.length
      ? Math.round(t.diasAtraso.reduce((a, b) => a + b, 0) / t.diasAtraso.length) : 0;
    return t;
  },

  /** Horas extras por semana do mês (semana 1 = dias 1–7, e assim por diante). */
  overtimeByWeek(key, txs) {
    const weeks = [0, 0, 0, 0, 0, 0];
    txs.filter(t => t.kind === 'hora_extra' && monthKey(t.data) === key).forEach(t => {
      const d = parseISO(t.data); if (!d) return;
      const w = Math.min(5, Math.floor((d.getDate() - 1) / 7));
      weeks[w] = round2(weeks[w] + num(t.horas));
    });
    let last = 3;
    weeks.forEach((v, i) => { if (v > 0) last = Math.max(last, i); });
    return weeks.slice(0, last + 1).map((h, i) => ({ label: `Semana ${i + 1}`, horas: h }));
  },

  /** Horas extras por mês (usado quando o período selecionado é o ano todo). */
  overtimeByMonth(keys, txs) {
    return keys.map(k => ({
      label: monthLabel(k),
      horas: this.overtimeHours(k, txs),
    }));
  },

  /* --------------------------------------------------------------------------------
     INSIGHTS — leituras derivadas do período selecionado.
     Cada item devolve { id, titulo, valor, nota, tom } ou null quando não há dado
     suficiente. Quem renderiza só descarta os nulos.
     -------------------------------------------------------------------------------- */
  insights(keys, txs, salaries) {
    const R = this.rangeSummary(keys, txs, salaries);
    const comDado = R.months.filter(m => m.receita > 0 || m.despesa > 0);
    const out = [];
    const add = o => { if (o) out.push(o); };

    if (!comDado.length) return out;

    // 1. Saldo médio mensal
    const saldoMedio = round2(R.saldo / comDado.length);
    add({
      id: 'saldo-medio', icone: 'trend',
      titulo: 'Saldo médio por mês',
      valor: money(saldoMedio),
      nota: `Média de ${comDado.length} mês(es) com movimento`,
      tom: saldoMedio < 0 ? 'ruim' : 'bom',
    });

    // 2. Taxa de poupança
    if (R.receita > 0) {
      const taxa = pct(R.saldo, R.receita);
      add({
        id: 'poupanca', icone: 'piggy',
        titulo: 'Do que entrou, sobrou',
        valor: `${taxa.toFixed(0)}%`,
        nota: taxa < 0 ? 'Você gastou mais do que recebeu no período'
            : taxa < 10 ? 'Margem apertada — pouco espaço para imprevisto'
            : taxa < 25 ? 'Margem razoável' : 'Boa folga entre o que entra e o que sai',
        tom: taxa < 0 ? 'ruim' : taxa < 10 ? 'atencao' : 'bom',
      });
    }

    // 3. Melhor e pior mês
    if (comDado.length > 1) {
      const ord = comDado.slice().sort((a, b) => b.saldo - a.saldo);
      add({
        id: 'melhor-mes', icone: 'up',
        titulo: 'Melhor mês',
        valor: monthLabelLong(ord[0].key).replace(' de ', '/'),
        nota: `Saldo de ${money(ord[0].saldo)}`,
        tom: 'bom',
      });
      add({
        id: 'pior-mes', icone: 'down',
        titulo: 'Mês mais apertado',
        valor: monthLabelLong(ord[ord.length - 1].key).replace(' de ', '/'),
        nota: `Saldo de ${money(ord[ord.length - 1].saldo)}`,
        tom: ord[ord.length - 1].saldo < 0 ? 'ruim' : 'neutro',
      });
    }

    // 4. Maior categoria de despesa
    const cats = [...this.expensesByCategory(keys, txs).entries()]
      .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (cats.length) {
      add({
        id: 'maior-categoria', icone: 'pie',
        titulo: 'Maior gasto',
        valor: cats[0][0],
        nota: `${money(cats[0][1])} · ${pctTxt(cats[0][1], R.despesa)} de tudo que saiu`,
        tom: 'neutro',
      });
    }

    // 5. Peso das horas extras
    if (R.horasExtras > 0) {
      add({
        id: 'horas-extras', icone: 'clock',
        titulo: 'Horas extras no período',
        valor: hours(R.horasExtras),
        nota: `${money(R.extra)} · ${pctTxt(R.extra, R.receita, 1)} da sua receita`,
        tom: 'neutro',
      });
    }

    // 6. Meses no vermelho
    const vermelho = comDado.filter(m => m.saldo < 0);
    if (comDado.length > 1) {
      add({
        id: 'vermelho', icone: 'alert',
        titulo: 'Meses no vermelho',
        valor: `${vermelho.length} de ${comDado.length}`,
        nota: vermelho.length
          ? `Fecharam negativo: ${vermelho.map(m => MONTHS_SHORT[+m.key.slice(5) - 1]).join(', ')}`
          : 'Nenhum mês fechou negativo no período',
        tom: vermelho.length ? 'atencao' : 'bom',
      });
    }

    // 7. Tendência de gastos: média da 1ª metade vs 2ª metade.
    //    Só faz sentido quando as DUAS metades têm despesa — senão a variação vira
    //    "-100%" apenas porque um dos lados está vazio, o que não informa nada.
    const meio = Math.floor(comDado.length / 2);
    const mediaA = meio ? comDado.slice(0, meio).reduce((s, m) => s + m.despesa, 0) / meio : 0;
    const mediaB = comDado.slice(meio).reduce((s, m) => s + m.despesa, 0) / (comDado.length - meio);
    if (comDado.length >= 4 && mediaA > 0 && mediaB > 0) {
      const varia = pct(mediaB - mediaA, mediaA);
      add({
        id: 'tendencia', icone: 'trend',
        titulo: 'Tendência das despesas',
        valor: `${varia >= 0 ? '+' : ''}${varia.toFixed(0)}%`,
        nota: `Segunda metade do período contra a primeira (${money(mediaA)} → ${money(mediaB)})`,
        tom: varia > 10 ? 'atencao' : varia < -10 ? 'bom' : 'neutro',
      });
    }

    // 8. Pendências do patrão
    const recv = this.receivableTotals(txs);
    if (recv.aReceber > 0) {
      add({
        id: 'patrao', icone: 'hand',
        titulo: 'O patrão ainda deve',
        valor: money(recv.aReceber),
        nota: recv.countAtrasado
          ? `${money(recv.atrasado)} em atraso · média de ${recv.atrasoMedio} dia(s)`
          : `${recv.countPendente} pendência(s) ainda dentro do prazo`,
        tom: recv.countAtrasado ? 'ruim' : 'atencao',
      });
    }

    // 9. Maior despesa avulsa do período
    const set = new Set(keys);
    const maior = txs.filter(t => t.kind === 'despesa' && set.has(monthKey(t.data)))
      .sort((a, b) => num(b.valor) - num(a.valor))[0];
    if (maior && comDado.length) {
      add({
        id: 'maior-despesa', icone: 'card',
        titulo: 'Maior despesa isolada',
        valor: money(maior.valor),
        nota: `${maior.descricao || maior.categoria} · ${fmtDate(maior.data)}`,
        tom: 'neutro',
      });
    }

    return out;
  },
};

/* ==================================================================================
   5. ESTADO DA UI
   ================================================================================== */

const State = {
  period: new Date().getMonth(),      // 0..11 para um mês, ou 'year' para o ano todo
  year: new Date().getFullYear(),
  categoria: '',
  status: '',
  tipo: '',
  search: '',
  page: 1,
  perPage: 25,
  evoView: 'chart',
  editingId: null,
  formKind: 'despesa',
  editingSalaryId: null,

  get isYear() { return this.period === 'year'; },

  /** Meses cobertos pelo filtro atual, em ordem cronológica. */
  get keys() {
    if (this.isYear) return Array.from({ length: 12 }, (_, m) => monthKeyOf(this.year, m));
    return [monthKeyOf(this.year, this.period)];
  },
  get key() { return this.keys[this.keys.length - 1]; },
  get from() { return monthStart(this.keys[0]); },
  get to() { return monthEnd(this.keys[this.keys.length - 1]); },
  get periodLabel() {
    return this.isYear ? `Ano de ${this.year}` : monthLabelLong(this.key);
  },
  /** Período anterior de mesmo tamanho — base das variações dos KPIs. */
  get previousKeys() {
    if (this.isYear) return Array.from({ length: 12 }, (_, m) => monthKeyOf(this.year - 1, m));
    const d = new Date(this.year, this.period - 1, 1);
    return [monthKeyOf(d.getFullYear(), d.getMonth())];
  },
};

/** Lançamentos visíveis no período/filtros atuais (usado pela tabela e pelo CSV). */
function filteredTransactions() {
  const set = new Set(State.keys);
  return Repo.all().filter(t => {
    const ref = t.kind === 'a_receber' ? (t.dataPrevista || t.data) : t.data;
    if (!set.has(monthKey(ref))) return false;
    if (State.tipo) {
      const flow = KINDS[t.kind]?.flow;
      if (State.tipo === 'receita' && flow !== 'in') return false;
      if (State.tipo === 'despesa' && flow !== 'out') return false;
    }
    if (State.categoria && (t.categoria || '') !== State.categoria) return false;
    if (State.status) {
      const st = t.kind === 'a_receber' ? Calc.receivableStatus(t) : (t.status || 'pago');
      if (st !== State.status) return false;
    }
    if (State.search) {
      const hay = `${t.descricao} ${t.categoria} ${t.observacao}`.toLowerCase();
      if (!hay.includes(State.search.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}
