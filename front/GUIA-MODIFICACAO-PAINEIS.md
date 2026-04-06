# 📘 GUIA DE MODIFICAÇÃO DOS PAINÉIS PARA API

## 🎯 Objetivo
Modificar os 3 painéis HTML para consumirem dados da API em vez de dados embutidos (hardcoded).

---

## 📋 Checklist Geral

Para cada painel, você precisa:
- [ ] Adicionar referência ao `api-config.js`
- [ ] Remover dados embutidos (variável `D` ou dados inline)
- [ ] Adicionar loading state
- [ ] Criar função de carregamento da API
- [ ] Adicionar tratamento de erros
- [ ] Atualizar inicialização do painel

---

## 🔧 MODIFICAÇÕES PASSO A PASSO

### **PASSO 1: Adicionar api-config.js no <head>**

Em **TODOS OS 3 PAINÉIS**, adicione antes do `</head>`:

```html
<!-- Adicionar ANTES de </head> -->
<script src="api-config.js"></script>
```

---

### **PASSO 2: Adicionar CSS para Loading**

Em **TODOS OS 3 PAINÉIS**, adicione no `<style>`:

```css
/* LOADING STATE */
.loading-overlay{
  position:fixed;
  top:0;left:0;right:0;bottom:0;
  background:rgba(13,17,23,0.95);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:9999;
  flex-direction:column;
  gap:20px;
}
.spinner{
  width:50px;height:50px;
  border:4px solid var(--border);
  border-top-color:var(--blue);
  border-radius:50%;
  animation:spin 1s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg);}}
.loading-text{
  font-size:14px;
  color:var(--muted);
  font-family:'Sora',sans-serif;
}
.error-container{
  background:var(--surface);
  border:1px solid var(--red);
  border-radius:10px;
  padding:24px;
  max-width:500px;
  text-align:center;
}
.error-icon{font-size:48px;margin-bottom:16px;}
.error-title{
  font-size:18px;
  font-weight:600;
  color:var(--red);
  margin-bottom:12px;
}
.error-message{
  font-size:14px;
  color:var(--muted);
  margin-bottom:20px;
  line-height:1.6;
}
.error-actions{
  display:flex;
  gap:12px;
  justify-content:center;
}
.error-btn{
  background:var(--surface2);
  border:1px solid var(--border);
  color:var(--text);
  padding:10px 20px;
  border-radius:6px;
  font-family:'Sora',sans-serif;
  font-size:13px;
  cursor:pointer;
  transition:all .2s;
}
.error-btn:hover{
  border-color:var(--blue);
  color:var(--blue);
}
.error-btn.primary{
  background:var(--blue);
  border-color:var(--blue);
  color:#fff;
}
.error-btn.primary:hover{
  background:#2596c9;
}
```

---

### **PASSO 3: Adicionar HTML para Loading**

Em **TODOS OS 3 PAINÉIS**, adicione logo após `<body>`:

```html
<body>
<!-- Loading Overlay -->
<div class="loading-overlay" id="loading-overlay">
  <div class="spinner"></div>
  <div class="loading-text">Carregando dados da API...</div>
</div>

<!-- Resto do conteúdo... -->
```

---

## 📊 PAINEL 1: VÍNCULOS

### **Localizar e REMOVER:**

Procure no `<script>` a linha que começa com:
```javascript
const D = {"stats":{"total_vinculos":...
```

**DELETE toda essa variável D** (pode ter centenas de linhas com dados embutidos).

---

### **ADICIONAR no início do <script>:**

```javascript
<script>
// Variável global para dados
let D = null;
let filteredTable = [];

// URL da API (configurada em api-config.js)
const API_URL = API_CONFIG.BASE_URL;

// FUNÇÃO PRINCIPAL: Carregar dados da API
async function loadDataFromAPI() {
  try {
    showLoading('Carregando estatísticas...');
    
    // Carregar dados em paralelo
    const [statsRes, agregadosRes, filtrosRes] = await Promise.all([
      apiRequest(API_CONFIG.ENDPOINTS.VINCULOS_STATS),
      apiRequest(API_CONFIG.ENDPOINTS.VINCULOS_AGREGADOS),
      apiRequest(API_CONFIG.ENDPOINTS.VINCULOS_FILTROS)
    ]);
    
    // Verificar erros
    if (!statsRes.success || !agregadosRes.success || !filtrosRes.success) {
      throw new Error('Falha ao carregar dados da API');
    }
    
    // Montar objeto D no formato esperado
    D = {
      stats: statsRes.data,
      ...agregadosRes.data
    };
    
    // Popular filtros
    populateFilters(filtrosRes.data);
    
    // Carregar tabela (primeira página)
    await loadTableData();
    
    hideLoading();
    
    // Inicializar painel
    init();
    
  } catch (error) {
    showError('Erro ao carregar dados', error.message);
  }
}

// Carregar dados da tabela com filtros
async function loadTableData(page = 1) {
  const filters = {
    page,
    limit: 30,
    operacao: activeFilters.op,
    cnes_status: activeFilters.cnes,
    sexo: activeFilters.sexo,
    escolaridade: activeFilters.esc,
    raca: activeFilters.raca,
    cine: activeFilters.cine,
    cbo: activeFilters.cbo,
    vinculo: activeFilters.vinculo
  };
  
  // Remover filtros vazios
  Object.keys(filters).forEach(key => {
    if (!filters[key]) delete filters[key];
  });
  
  const result = await apiRequest(API_CONFIG.ENDPOINTS.VINCULOS_TABELA, filters);
  
  if (result.success) {
    filteredTable = result.data.data;
    updatePagination(result.data.pagination);
    renderTable();
    updateKPIs(); // Atualizar KPIs com base nos dados filtrados
  }
}

// Popular filtros com dados da API
function populateFilters(data) {
  pop('f-esc', data.escolaridade || []);
  pop('f-raca', data.raca || []);
  pop('f-cine', data.cine || []);
}

// Funções de UI
function showLoading(message = 'Carregando...') {
  const overlay = document.getElementById('loading-overlay');
  const text = overlay.querySelector('.loading-text');
  if (text) text.textContent = message;
  overlay.style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

function showError(title, message) {
  const overlay = document.getElementById('loading-overlay');
  overlay.innerHTML = `
    <div class="error-container">
      <div class="error-icon">⚠️</div>
      <div class="error-title">${title}</div>
      <div class="error-message">${message}</div>
      <div class="error-details" style="font-size:11px;color:var(--muted);margin-bottom:20px;">
        Verifique se a API está rodando em: ${API_CONFIG.BASE_URL}
      </div>
      <div class="error-actions">
        <button class="error-btn primary" onclick="location.reload()">Tentar Novamente</button>
        <button class="error-btn" onclick="window.open('${API_CONFIG.BASE_URL}/health', '_blank')">
          Verificar API
        </button>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';
}

// Iniciar carregamento quando a página carregar
document.addEventListener('DOMContentLoaded', loadDataFromAPI);

// Resto do código existente...
```

---

### **MODIFICAR a função applyFilters:**

```javascript
// ANTES:
function applyFilters(){
  const {op,cnes,sexo,esc,raca,cine,cbo,vinculo} = activeFilters;
  filteredTable = D.table.filter(r=>{
    // ... filtros locais
  });
  // ...
}

// DEPOIS:
async function applyFilters(){
  activeFilters = {
    op: document.getElementById('f-op').value,
    cnes: document.getElementById('f-cnes').value,
    sexo: document.getElementById('f-sexo').value,
    esc: document.getElementById('f-esc').value,
    raca: document.getElementById('f-raca').value,
    cine: document.getElementById('f-cine').value,
    cbo: document.getElementById('f-cbo').value,
    vinculo: document.getElementById('f-vinculo').value
  };
  
  page = 1;
  await loadTableData(page);
}
```

---

### **MODIFICAR funções de paginação:**

```javascript
async function changePg(dir) {
  page += dir;
  await loadTableData(page);
}
```

---

### **MODIFICAR updateKPIs para usar dados da API:**

Como a API já retorna as estatísticas calculadas, simplifique:

```javascript
function updateKPIs(){
  if (!D || !D.stats) return;
  
  const stats = D.stats;
  const fmt = n => n.toLocaleString('pt-BR');
  
  set('k-total', fmt(stats.total_vinculos));
  set('k-prof', fmt(stats.total_profissionais));
  set('k-ch', stats.media_carga_horaria + 'h');
  set('k-inc', fmt(stats.inclusoes));
  set('k-alt', fmt(stats.alteracoes));
  set('k-exc', fmt(stats.exclusoes));
  set('k-cnes-s', fmt(stats.igual_cnes));
  set('k-cnes-n', fmt(stats.diverge_cnes));
  
  // Calcular percentuais
  const total = stats.total_vinculos;
  set('k-inc-pct', ((stats.inclusoes/total)*100).toFixed(1) + '% do total');
  set('k-alt-pct', ((stats.alteracoes/total)*100).toFixed(1) + '% do total');
  set('k-exc-pct', ((stats.exclusoes/total)*100).toFixed(1) + '% do total');
  set('k-cnes-s-pct', ((stats.igual_cnes/total)*100).toFixed(1) + '% do total');
  set('k-cnes-n-pct', ((stats.diverge_cnes/total)*100).toFixed(1) + '% do total');
}
```

---

## 📊 PAINEL 2: ESTABELECIMENTOS

### **Mesma lógica do Painel de Vínculos**

```javascript
async function loadDataFromAPI() {
  try {
    showLoading('Carregando dados dos estabelecimentos...');
    
    const [statsRes, situacaoRes, ufRes] = await Promise.all([
      apiRequest(API_CONFIG.ENDPOINTS.ESTABELECIMENTOS_STATS),
      apiRequest(API_CONFIG.ENDPOINTS.ESTABELECIMENTOS_POR_SITUACAO),
      apiRequest(API_CONFIG.ENDPOINTS.ESTABELECIMENTOS_POR_UF)
    ]);
    
    if (!statsRes.success || !situacaoRes.success || !ufRes.success) {
      throw new Error('Falha ao carregar dados');
    }
    
    // Montar dados no formato esperado
    D = {
      stats: statsRes.data,
      situacoes: situacaoRes.data,
      ufs: ufRes.data
    };
    
    hideLoading();
    init();
    
  } catch (error) {
    showError('Erro ao carregar dados', error.message);
  }
}

document.addEventListener('DOMContentLoaded', loadDataFromAPI);
```

---

## 📊 PAINEL 3: RESOLUÇÃO

```javascript
async function loadDataFromAPI() {
  try {
    showLoading('Carregando dados de resolução...');
    
    const result = await apiRequest(API_CONFIG.ENDPOINTS.RESOLUCAO_DADOS);
    
    if (!result.success) {
      throw new Error('Falha ao carregar dados de resolução');
    }
    
    // Os dados já vêm no formato esperado
    D = result.data;
    
    hideLoading();
    render(); // Função existente do painel
    
  } catch (error) {
    showError('Erro ao carregar dados', error.message);
  }
}

document.addEventListener('DOMContentLoaded', loadDataFromAPI);
```

---

## ✅ CHECKLIST FINAL

Após modificar os 3 painéis:

- [ ] `api-config.js` está na mesma pasta dos painéis
- [ ] Todos os painéis importam `<script src="api-config.js"></script>`
- [ ] Dados embutidos (variável `D`) foram removidos
- [ ] Loading overlay adicionado
- [ ] Funções de carregamento da API adicionadas
- [ ] Tratamento de erros implementado
- [ ] API está rodando (`npm start`)
- [ ] Testar cada painel no navegador

---

## 🧪 TESTE

1. **Iniciar API:**
   ```bash
   cd fiocruz-api
   npm start
   ```

2. **Abrir painéis no navegador:**
   - `painel_vinculos_reorganizado.html`
   - `painel_fiocruz_reorganizado.html`
   - `painel_resolucao.html`

3. **Verificar console do navegador (F12):**
   - Deve mostrar: `[API] Requisição: /api/vinculos/stats`
   - Deve mostrar: `[API] Sucesso: /api/vinculos/stats`

4. **Se der erro:**
   - Verificar se API está rodando
   - Verificar URL em `api-config.js`
   - Ver console do navegador (F12) para detalhes

---

## 🔧 TROUBLESHOOTING

### Erro: "Failed to fetch"
- **Causa:** API não está rodando ou URL errada
- **Solução:** Verificar se `npm start` está rodando e URL em `api-config.js`

### Erro: "CORS policy"
- **Causa:** Problema de CORS (improvável, já configuramos)
- **Solução:** Verificar se `cors()` está no server.js

### Dados não aparecem
- **Causa:** Estrutura de dados diferente
- **Solução:** Ver console (F12) e verificar formato dos dados da API

---

## 📞 PRÓXIMOS PASSOS

Depois de modificar e testar:
1. ✅ Painéis funcionando com API
2. 🚀 Deploy da API em produção (Render/Railway/VPS)
3. 🔧 Atualizar `API_CONFIG.BASE_URL` para URL de produção
4. 🎨 Ajustes finais de UX/UI se necessário

---

**Quer que eu crie os arquivos HTML completos já modificados?** Ou prefere seguir este guia manualmente?
