# Financial Analytics

Dashboard web de controle financeiro pessoal — salário, vale transporte, horas extras,
liberamentos, despesas por categoria e contas a receber do patrão.

**[▶ Abrir o painel](https://falculista.github.io/Financial-Analytics/)**

Roda **abrindo o `index.html` no navegador**. Sem build, sem servidor, sem instalação.
Os dados ficam salvos no `localStorage` do próprio navegador — nada sai do dispositivo.

---

## Estrutura

```
.
├── index.html          Marcação da página (só HTML — nada de CSS ou JS embutido)
├── css/
│   └── styles.css      Tokens de design (cores, sombras) e componentes de interface
└── js/
    ├── core.js         Domínio, persistência e motor de cálculo — não toca no DOM
    ├── dom.js          Helpers de DOM, paleta de cores, avisos (toasts) e modais
    ├── charts.js       Os cinco gráficos do painel (Chart.js)
    ├── ui.js           KPIs, tabelas, filtros e tema claro/escuro
    ├── forms.js        Formulários, CRUD, backup JSON/CSV e inicialização
    └── pdf.js          Relatório executivo em PDF (jsPDF)
```

O `index.html` fica na **raiz do repositório** — é assim que o GitHub Pages encontra a
página.

A ordem das tags `<script>` no fim do `index.html` importa: cada arquivo usa o anterior.
São scripts clássicos (não módulos ES) justamente para funcionar via `file://`, sem servidor.

### Por que essa divisão

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| 1. Storage Adapter | `core.js` | Conversa com a fonte de dados. Hoje `localStorage`; amanhã uma API. |
| 2. Repository | `core.js` | `id`, `userId`, timestamps e normalização de lançamentos e períodos de salário. |
| 3. Calc | `core.js` | Motor financeiro — funções puras, sem efeito colateral. |
| 4. UI | `dom/charts/ui/forms` | Desenha e reage. Não sabe de onde vieram os dados. |
| 5. Relatório | `pdf.js` | Monta o PDF a partir das mesmas funções de cálculo. |

Nenhuma camada acima da primeira acessa `localStorage` diretamente. Isso é intencional.

---

## Dependências (via CDN)

| Biblioteca | Uso |
|---|---|
| Tailwind CSS 3.4 | Espaçamento e grid. Cor e identidade visual ficam no `styles.css`. |
| Chart.js 4.4 | Os cinco gráficos. |
| jsPDF 2.5 | Desenha o relatório em vetor (texto nítido em qualquer zoom). |
| html2canvas 1.4 | Plano B: captura o gráfico caso a exportação do canvas falhe. |

---

## Como usar

1. **Salário e Benefícios** — cadastre um período: valor, a data em que passou a
   receber (`A partir de`), `Até o momento` ou uma data final, e os benefícios.
   Meses anteriores à data de início ficam **sem salário** — o painel não inventa
   receita que você não teve.
2. **Barra de ações** — os botões ficam à vista, cada um escrito: `Despesa`,
   `Hora extra`, `Liberamento`, `Receita extra`, `A receber do patrão`.
3. **Filtro Período** — alterne entre um mês e **O ano todo**. KPIs, gráficos,
   análises e tabela seguem a escolha.
4. **Relatório PDF** — escolha o período, marque as seções, escreva uma observação
   e baixe.
5. **Dados → Exportar JSON** — backup completo e restaurável.

O painel também traz um "Como usar" recolhível no rodapé, com o passo a passo completo.

### Reajuste de salário

Não edite o valor antigo. Coloque uma **data final** no período que acabou e crie um
**novo período**. O histórico continua calculado com os valores da época — é para isso
que o salário é um período, e não um número solto.

### Dados de exemplo

O painel começa vazio. No menu **Dados** há `Carregar dados de exemplo` (12 meses
fictícios, com um reajuste no meio) e `Apagar todos os dados`.

---

## Regras de cálculo

```
Receita    = salário + benefícios + horas extras + receitas extras − liberamentos
Salário    = valor do período × (dias cobertos no mês ÷ dias do mês)
Hora extra = horas × valor da hora gravado naquele lançamento
Saldo      = receita − despesas
Atrasado   = data prevista < hoje  E  status ≠ pago
```

**Mês parcial**: começou dia 15 num mês de 30 dias? O salário entra pela metade. O
detalhamento do PDF mostra a cobertura (`16/30 dias`) para você conferir.

**Benefícios** têm frequência:

| Frequência | Como vira dinheiro no mês |
|---|---|
| Por semana | valor × número de segundas-feiras dentro do período (4 ou 5) |
| Por dia útil | valor × dias de segunda a sexta dentro do período |
| Por mês | valor cheio, proporcional aos dias se o período for parcial |

**Valor da hora extra** vive no próprio lançamento (pré-preenchido com o último usado),
não numa configuração global: reajuste futuro não reescreve o histórico.

A marcação de "atrasado" é **derivada, nunca gravada** — assim nunca fica desatualizada.

---

## Próximo passo: backend com login

A migração já está preparada. Em `js/core.js` existe o esqueleto comentado do
`ApiAdapter`, com os mesmos cinco métodos do `LocalStorageAdapter`:

```js
listTransactions()   listSalaries()   getSettings()
saveTransactions()   saveSalaries()   saveSettings()
clear()
```

Para migrar, escreva o `ApiAdapter` e troque **uma linha**:

```js
const Repo = {
  adapter: ApiAdapter,   // antes: LocalStorageAdapter
  ...
};
```

A interface não muda nenhuma linha. Todo registro já nasce com `id`, `userId`,
`createdAt` e `updatedAt`, então também não haverá migração de dados —
`Repo.currentUserId()` é o único ponto que precisa passar a ler a sessão autenticada.

---

## Acessibilidade

A paleta dos gráficos foi validada para os três tipos de daltonismo (protanopia,
deuteranopia, tritanopia) nos temas claro e escuro. Duas consequências no código,
documentadas nos comentários — não "conserte" sem querer:

- **"Outros" no donut é vermelho, não azul.** O donut é um anel: a última fatia
  encosta na primeira, e azul ao lado de violeta fica indistinguível.
- **Nenhuma informação depende só de cor.** Todo status vem com texto, toda legenda
  traz o valor, e o gráfico de evolução tem uma aba "Tabela" equivalente.

Os campos de seleção também são componentes próprios (`dom.js`, seção 6b), com
`role="listbox"`, navegação por setas, Home/End, Enter, Esc e busca por digitação.
O `<select>` nativo continua na página — invisível, mas é ele que guarda o valor,
entra no `FormData` e dispara os eventos `change`. A troca é só de aparência: a lista
que o navegador abre é desenhada pelo sistema operacional e não aceita CSS.
