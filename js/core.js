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

const APP = { version: '1.0.0', storageKey: 'finapp:v1' };

/** Tipos de lançamento. `flow` diz se entra ou sai do bolso. */
const KINDS = {
  receita:     { label: 'Receita extra',  flow: 'in',  icon: 'plus',   desc: 'Qualquer entrada fora do salário' },
  despesa:     { label: 'Despesa',        flow: 'out', icon: 'card',   desc: 'Gasto por categoria' },
  hora_extra:  { label: 'Hora extra',     flow: 'in',  icon: 'clock',  desc: 'Horas × valor/hora' },
  vt:          { label: 'Vale transporte',flow: 'in',  icon: 'bus',    desc: 'Ajuste manual de VT' },
  liberamento: { label: 'Liberamento',    flow: 'out', icon: 'minus',  desc: 'Horas não trabalhadas (desconto)' },
  a_receber:   { label: 'A receber',      flow: 'in',  icon: 'hand',   desc: 'O patrão ainda deve' },
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

/** Categorias de receita — ordem fixa. */
const REVENUE_CATS = ['Salário', 'Vale Transporte', 'Hora Extra', 'Outras receitas'];

/** Subtipos de pendência do patrão. */
const RECV_KINDS = ['Hora extra', 'Vale transporte', 'Salário', 'Outro'];

const DEFAULT_SETTINGS = {
  salarioMensal: 2000,      // salário fixo (configurável)
  vtSemanal: 55,            // R$ 55,00 por semana
  valorHoraExtra: 10,       // R$ 10,00 por hora
  diaPagamento: 5,          // dia do mês em que o salário cai
  overrides: {},            // { 'YYYY-MM': { salario?: number, semanasVt?: number } }
  theme: 'dark',
};

/* ==================================================================================
   1. STORAGE ADAPTER
   ----------------------------------------------------------------------------------
   Interface assíncrona de propósito. Quando o backend existir, basta escrever um
   ApiAdapter com os mesmos 5 métodos e trocar a linha do `Repo.adapter`.
   ================================================================================== */

const LocalStorageAdapter = {
  name: 'localStorage',

  _read() {
    try {
      const raw = localStorage.getItem(APP.storageKey);
      if (!raw) return { transactions: [], settings: { ...DEFAULT_SETTINGS } };
      const parsed = JSON.parse(raw);
      return {
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      };
    } catch (e) {
      console.warn('[storage] falha ao ler, começando vazio:', e);
      return { transactions: [], settings: { ...DEFAULT_SETTINGS } };
    }
  },
  _write(db) {
    try { localStorage.setItem(APP.storageKey, JSON.stringify(db)); return true; }
    catch (e) { console.error('[storage] falha ao gravar:', e); return false; }
  },

  async listTransactions() { return this._read().transactions; },
  async saveTransactions(list) { const db = this._read(); db.transactions = list; return this._write(db); },
  async getSettings() { return this._read().settings; },
  async saveSettings(s) { const db = this._read(); db.settings = s; return this._write(db); },
  async clear() { return this._write({ transactions: [], settings: { ...DEFAULT_SETTINGS } }); },
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
     async getSettings()          { ... GET /settings ... },
     async saveSettings(s)        { ... PUT /settings ... },
     async clear()                { ... DELETE /transactions ... },
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
  cache: { transactions: [], settings: { ...DEFAULT_SETTINGS } },

  /** Usuário corrente. Sem login ainda: um único usuário local. */
  currentUserId() { return 'local-user'; },

  newId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  },

  async load() {
    this.cache.transactions = await this.adapter.listTransactions();
    this.cache.settings = await this.adapter.getSettings();
    return this.cache;
  },

  all() { return this.cache.transactions; },
  settings() { return this.cache.settings; },

  /** Normaliza um lançamento vindo do formulário ou de um import. */
  normalize(tx) {
    const now = new Date().toISOString();
    const horas = num(tx.horas);
    const t = {
      id: tx.id || this.newId(),
      userId: tx.userId || this.currentUserId(),
      kind: tx.kind,
      descricao: (tx.descricao || '').trim(),
      categoria: tx.categoria || '',
      valor: round2(num(tx.valor)),
      horas: horas || null,
      data: tx.data || todayISO(),
      dataPrevista: tx.dataPrevista || null,
      dataPagamento: tx.dataPagamento || null,
      status: tx.status || 'pago',
      observacao: (tx.observacao || '').trim(),
      createdAt: tx.createdAt || now,
      updatedAt: now,
    };
    // Lançamentos que derivam valor de horas têm o valor recalculado ao salvar.
    if (t.kind === 'hora_extra' || t.kind === 'liberamento') {
      t.valor = round2((t.horas || 0) * num(this.settings().valorHoraExtra));
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

  async saveSettings(patch) {
    this.cache.settings = { ...this.cache.settings, ...patch };
    await this.adapter.saveSettings(this.cache.settings);
  },

  async wipe() {
    await this.adapter.clear();
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

/** Diferença em dias entre duas datas ISO (b − a), ignorando horas. */
function daysBetween(aISO, bISO) {
  const a = parseISO(aISO), b = parseISO(bISO);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

/* ==================================================================================
   4. CALC — MOTOR FINANCEIRO
   ----------------------------------------------------------------------------------
   Funções puras: recebem dados e configurações, devolvem números. Nenhuma toca no
   DOM nem no storage — é isso que permite testá-las e reaproveitá-las no backend.
   ================================================================================== */

const Calc = {

  /* --------------------------------------------------------------------------------
     REGRA VT — "R$ 55,00 por semana (4 ou 5 semanas por mês, dependendo do calendário)"
     --------------------------------------------------------------------------------
     O vale sai uma vez por semana de trabalho. A contagem de semanas de trabalho de
     um mês é, na prática, a contagem de segundas-feiras dentro dele: um mês tem 4 ou
     5 segundas, exatamente a variação que o usuário descreveu.
     O valor pode ser sobrescrito manualmente por mês nas Configurações.
     -------------------------------------------------------------------------------- */
  weeksInMonth(year, month /* 0..11 */) {
    const last = new Date(year, month + 1, 0).getDate();
    let mondays = 0;
    for (let d = 1; d <= last; d++) if (new Date(year, month, d).getDay() === 1) mondays++;
    return mondays;
  },

  /** Semanas de VT efetivas do mês: override manual, se houver; senão, o calendário. */
  vtWeeks(key, settings) {
    const ov = settings.overrides?.[key];
    if (ov && ov.semanasVt !== undefined && ov.semanasVt !== null && ov.semanasVt !== '') return Math.max(0, Math.round(num(ov.semanasVt)));
    const [y, m] = key.split('-').map(Number);
    return this.weeksInMonth(y, m - 1);
  },

  /** Valor total de VT do mês = semanas × valor semanal (+ ajustes manuais lançados). */
  vtTotal(key, txs, settings) {
    const base = this.vtWeeks(key, settings) * num(settings.vtSemanal);
    const ajustes = txs.filter(t => t.kind === 'vt' && monthKey(t.data) === key)
                       .reduce((s, t) => s + num(t.valor), 0);
    return round2(base + ajustes);
  },

  /** Salário do mês: override do mês, se existir; senão o salário fixo. */
  salary(key, settings) {
    const ov = settings.overrides?.[key];
    if (ov && ov.salario !== undefined && ov.salario !== null && ov.salario !== '') return round2(num(ov.salario));
    return round2(num(settings.salarioMensal));
  },

  /* REGRA HORA EXTRA — valor_hora = R$ 10,00 → horas × 10 */
  overtimeHours(key, txs) {
    return round2(txs.filter(t => t.kind === 'hora_extra' && monthKey(t.data) === key)
                     .reduce((s, t) => s + num(t.horas), 0));
  },
  overtimeValue(key, txs, settings) {
    // O valor gravado no lançamento manda (permite hora extra com valor diferenciado);
    // se por algum motivo vier zerado, cai no cálculo horas × valor/hora.
    return round2(txs.filter(t => t.kind === 'hora_extra' && monthKey(t.data) === key)
                     .reduce((s, t) => s + (num(t.valor) || num(t.horas) * num(settings.valorHoraExtra)), 0));
  },

  /* REGRA LIBERAMENTO — horas não trabalhadas viram desconto na receita do mês */
  releaseHours(key, txs) {
    return round2(txs.filter(t => t.kind === 'liberamento' && monthKey(t.data) === key)
                     .reduce((s, t) => s + num(t.horas), 0));
  },
  releaseValue(key, txs, settings) {
    return round2(txs.filter(t => t.kind === 'liberamento' && monthKey(t.data) === key)
                     .reduce((s, t) => s + (num(t.valor) || num(t.horas) * num(settings.valorHoraExtra)), 0));
  },

  /** Receitas extras lançadas à mão (fora de salário/VT/hora extra). */
  otherRevenue(key, txs) {
    return round2(txs.filter(t => t.kind === 'receita' && monthKey(t.data) === key)
                     .reduce((s, t) => s + num(t.valor), 0));
  },

  /** Despesas do mês, com filtro opcional de categoria. */
  expenses(key, txs, categoria) {
    return round2(txs.filter(t => t.kind === 'despesa' && monthKey(t.data) === key
                                  && (!categoria || t.categoria === categoria))
                     .reduce((s, t) => s + num(t.valor), 0));
  },

  /** Despesas quebradas por categoria (ordem fixa das categorias). */
  expensesByCategory(key, txs) {
    const map = new Map(EXPENSE_CATS.map(c => [c, 0]));
    txs.filter(t => t.kind === 'despesa' && monthKey(t.data) === key).forEach(t => {
      const c = EXPENSE_CATS.includes(t.categoria) ? t.categoria : 'Outros';
      map.set(c, round2(map.get(c) + num(t.valor)));
    });
    return map;
  },

  /* --------------------------------------------------------------------------------
     RESUMO DO MÊS
     receita = salário + VT + hora extra + receitas extras − liberamentos
     saldo   = receita − despesas
     -------------------------------------------------------------------------------- */
  monthSummary(key, txs, settings) {
    const salario   = this.salary(key, settings);
    const vt        = this.vtTotal(key, txs, settings);
    const extra     = this.overtimeValue(key, txs, settings);
    const outras    = this.otherRevenue(key, txs);
    const descontos = this.releaseValue(key, txs, settings);
    const receita   = round2(salario + vt + extra + outras - descontos);
    const despesa   = this.expenses(key, txs);
    return {
      key, salario, vt, extra, outras, descontos,
      receita, despesa,
      saldo: round2(receita - despesa),
      horasExtras: this.overtimeHours(key, txs),
      horasLiberadas: this.releaseHours(key, txs),
      semanasVt: this.vtWeeks(key, settings),
    };
  },

  /** Série dos últimos N meses terminando em `key` (para o gráfico de evolução). */
  series(key, n, txs, settings) {
    const [y, m] = key.split('-').map(Number);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      out.push(this.monthSummary(monthKeyOf(d.getFullYear(), d.getMonth()), txs, settings));
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
    const t = { pago: 0, pendente: 0, atrasado: 0, countPago: 0, countPendente: 0, countAtrasado: 0 };
    r.forEach(x => { t[x._status] = round2(t[x._status] + num(x.valor)); t['count' + x._status[0].toUpperCase() + x._status.slice(1)]++; });
    t.aReceber = round2(t.pendente + t.atrasado);
    return t;
  },

  /** Horas extras agrupadas por semana do mês (semana 1 = dias 1–7, e assim por diante). */
  overtimeByWeek(key, txs) {
    const weeks = [0, 0, 0, 0, 0, 0];
    txs.filter(t => t.kind === 'hora_extra' && monthKey(t.data) === key).forEach(t => {
      const d = parseISO(t.data); if (!d) return;
      const w = Math.min(5, Math.floor((d.getDate() - 1) / 7));
      weeks[w] = round2(weeks[w] + num(t.horas));
    });
    // corta as semanas finais vazias, mas mantém no mínimo 4 barras
    let last = 3;
    weeks.forEach((v, i) => { if (v > 0) last = Math.max(last, i); });
    return weeks.slice(0, last + 1);
  },
};

/* ==================================================================================
   5. ESTADO DA UI
   ================================================================================== */

const State = {
  month: new Date().getMonth(),       // 0..11
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
  get key() { return monthKeyOf(this.year, this.month); },
};

/** Lançamentos visíveis no mês/filtros atuais (usado pela tabela e pelo CSV). */
function filteredTransactions() {
  const key = State.key;
  return Repo.all().filter(t => {
    const inMonth = monthKey(t.kind === 'a_receber' ? (t.dataPrevista || t.data) : t.data) === key;
    if (!inMonth) return false;
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
