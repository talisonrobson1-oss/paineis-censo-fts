/**
 * PAINEL DE VÍNCULOS - INTEGRAÇÃO COM API
 * 
 * INSTRUÇÕES DE USO:
 * 1. Abra o arquivo: painel_vinculos_reorganizado.html
 * 2. Localize a tag <script> (perto da linha 400)
 * 3. SUBSTITUA TODO O CONTEÚDO entre <script> e </script> por este código
 * 4. Adicione <script src="api-config.js"></script> no <head> antes de </head>
 * 5. Adicione o CSS e HTML de loading (ver arquivo LOADING-COMPONENTS.html)
 */

// ==========================================
// CONFIGURAÇÃO E VARIÁVEIS GLOBAIS
// ==========================================
let D = null;
let filteredTable = [];
let activeFilters = {op:'',cnes:'',sexo:'',esc:'',raca:'',cine:'',cbo:'',vinculo:''};
let sortIdx = -1, sortDir = 1;
let page = 1;
const PG = 30;
const CH = {};

// ==========================================
// FUNÇÕES DE UI - LOADING E ERROS
// ==========================================
function showLoading(message = 'Carregando dados...') {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    const text = overlay.querySelector('.loading-text');
    if (text) text.textContent = message;
    overlay.style.display = 'flex';
  }
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showError(title, message) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.innerHTML = `
      <div class="error-container">
        <div class="error-icon">⚠️</div>
        <div class="error-title">${title}</div>
        <div class="error-message">${message}</div>
        <div class="error-details">
          Verifique se a API está rodando em: ${API_CONFIG.BASE_URL}
        </div>
        <div class="error-actions">
          <button class="error-btn primary" onclick="location.reload()">Tentar Novamente</button>
          <button class="error-btn" onclick="window.open('${API_CONFIG.BASE_URL}/health', '_blank')">Verificar API</button>
        </div>
      </div>
    `;
    overlay.style.display = 'flex';
  }
}

// ==========================================
// CARREGAMENTO DE DADOS DA API
// ==========================================
async function loadDataFromAPI() {
  try {
    showLoading('Carregando estatísticas de vínculos...');
    
    // Verificar se API está online
    const isOnline = await checkApiHealth();
    if (!isOnline) {
      throw new Error('API não está respondendo');
    }
    
    showLoading('Buscando dados agregados...');
    
    // Carregar dados em paralelo
    const [statsRes, agregadosRes, filtrosRes] = await Promise.all([
      apiRequest(API_CONFIG.ENDPOINTS.VINCULOS_STATS),
      apiRequest(API_CONFIG.ENDPOINTS.VINCULOS_AGREGADOS),
      apiRequest(API_CONFIG.ENDPOINTS.VINCULOS_FILTROS)
    ]);
    
    if (!statsRes.success) throw new Error(statsRes.error || 'Erro ao carregar estatísticas');
    if (!agregadosRes.success) throw new Error(agregadosRes.error || 'Erro ao carregar dados agregados');
    if (!filtrosRes.success) throw new Error(filtrosRes.error || 'Erro ao carregar filtros');
    
    showLoading('Processando dados...');
    
    // Montar objeto D no formato esperado pelo painel
    D = {
      stats: statsRes.data,
      ...agregadosRes.data,
      table: [] // Será carregado via paginação
    };
    
    // Popular filtros dinâmicos
    populateFilters(filtrosRes.data);
    
    // Atualizar header meta
    document.getElementById('hdr-meta').innerHTML =
      `Total de vínculos: ${D.stats.total_vinculos.toLocaleString('pt-BR')}<br>` +
      `Profissionais únicos: ${D.stats.total_profissionais.toLocaleString('pt-BR')}<br>` +
      `Estabelecimentos: ${D.stats.total_cnes.toLocaleString('pt-BR')}`;
    
    showLoading('Carregando tabela...');
    
    // Carregar primeira página da tabela
    await loadTableData(1);
    
    hideLoading();
    
    // Inicializar painel
    initializePainel();
    
    console.log('✅ Painel de vínculos carregado com sucesso');
    
  } catch (error) {
    console.error('❌ Erro ao carregar painel:', error);
    showError('Erro ao Carregar Dados', error.message);
  }
}

// ==========================================
// CARREGAMENTO DA TABELA COM FILTROS
// ==========================================
async function loadTableData(pageNum = 1) {
  try {
    page = pageNum;
    
    const filters = {
      page: pageNum,
      limit: PG
    };
    
    // Adicionar filtros ativos
    if (activeFilters.op) filters.operacao = activeFilters.op;
    if (activeFilters.cnes) filters.cnes_status = activeFilters.cnes;
    if (activeFilters.sexo) filters.sexo = activeFilters.sexo;
    if (activeFilters.esc) filters.escolaridade = activeFilters.esc;
    if (activeFilters.raca) filters.raca = activeFilters.raca;
    if (activeFilters.cine) filters.cine = activeFilters.cine;
    if (activeFilters.cbo) filters.cbo = activeFilters.cbo;
    if (activeFilters.vinculo) filters.vinculo = activeFilters.vinculo;
    
    const result = await apiRequest(API_CONFIG.ENDPOINTS.VINCULOS_TABELA, filters);
    
    if (!result.success) {
      console.error('Erro ao carregar tabela:', result.error);
      return;
    }
    
    // Transformar dados para formato esperado
    filteredTable = result.data.data.map(row => [
      row.cpf_ultimos_4,
      row.nu_cpf,
      row.co_sexo,
      row.ds_cbo_ocupacao,
      row.vinculacao,
      row.carga_horaria_total,
      row.vl_remuneracao,
      row.no_tipo_operacao_censo,
      row.co_cnes,
      row.st_cnes,
      row.ds_escolaridade,
      row.ds_raca_cor,
      row.ds_cine
    ]);
    
    // Atualizar paginação
    updatePaginationUI(result.data.pagination);
    
    // Renderizar tabela
    renderTable();
    
    // Atualizar KPIs (baseado nos dados filtrados se houver filtro ativo)
    updateKPIs();
    
  } catch (error) {
    console.error('Erro ao carregar tabela:', error);
  }
}

// ==========================================
// POPULAR FILTROS
// ==========================================
function populateFilters(data) {
  pop('f-esc', data.escolaridade || []);
  pop('f-raca', data.raca || []);
  pop('f-cine', data.cine || []);
}

function pop(id, vals){
  const s = document.getElementById(id);
  if (!s) return;
  // Limpar opções existentes (exceto a primeira)
  while (s.options.length > 1) s.remove(1);
  // Adicionar novas opções
  vals.forEach(v=>{ 
    const o=document.createElement('option'); 
    o.value=o.textContent=v; 
    s.appendChild(o); 
  });
}

// ==========================================
// INICIALIZAÇÃO DO PAINEL
// ==========================================
function initializePainel() {
  // Eventos de filtros
  ['f-op','f-cnes','f-sexo','f-esc','f-raca','f-cine'].forEach(id=>{
    const elem = document.getElementById(id);
    if (elem) {
      elem.addEventListener('change', ()=>{
        activeFilters[id.replace('f-','')] = elem.value;
        applyFilters();
      });
    }
  });
  
  document.getElementById('f-cbo')?.addEventListener('input', ()=>{
    activeFilters.cbo = document.getElementById('f-cbo').value.toLowerCase().trim();
    applyFilters();
  });
  
  document.getElementById('f-vinculo')?.addEventListener('input', ()=>{
    activeFilters.vinculo = document.getElementById('f-vinculo').value.toLowerCase().trim();
    applyFilters();
  });
  
  // Renderizar gráficos
  renderCharts();
  
  // Atualizar KPIs
  updateKPIs();
}

// ==========================================
// APLICAR FILTROS
// ==========================================
async function applyFilters(){
  const hasFilter = Object.values(activeFilters).some(v=>v!=='');
  const note = document.getElementById('filter-note');
  if (note) {
    note.textContent = hasFilter 
      ? `⚠ Gráficos exibem dados globais · tabela mostra registros filtrados`
      : '';
  }
  
  page = 1;
  await loadTableData(page);
}

function resetFilters(){
  activeFilters={op:'',cnes:'',sexo:'',esc:'',raca:'',cine:'',cbo:'',vinculo:''};
  ['f-op','f-cnes','f-sexo','f-esc','f-raca','f-cine'].forEach(id=>{
    const elem = document.getElementById(id);
    if (elem) elem.value='';
  });
  const cbo = document.getElementById('f-cbo');
  const vinc = document.getElementById('f-vinculo');
  if (cbo) cbo.value='';
  if (vinc) vinc.value='';
  applyFilters();
}

// ==========================================
// ATUALIZAR KPIs
// ==========================================
function updateKPIs(){
  if (!D || !D.stats) return;
  
  const stats = D.stats;
  const total = stats.total_vinculos;
  const fmt = n => (n || 0).toLocaleString('pt-BR');
  const pct = (n)=> total? ((n/total)*100).toFixed(1)+'%' : '—';
  
  set('k-total', fmt(total));
  set('k-prof', fmt(stats.total_profissionais));
  set('k-ch', (stats.media_carga_horaria || 0)+'h');
  
  set('k-inc', fmt(stats.inclusoes));
  set('k-inc-pct', pct(stats.inclusoes)+' do total');
  
  set('k-alt', fmt(stats.alteracoes));
  set('k-alt-pct', pct(stats.alteracoes)+' do total');
  
  set('k-exc', fmt(stats.exclusoes));
  set('k-exc-pct', pct(stats.exclusoes)+' do total');
  
  set('k-cnes-s', fmt(stats.igual_cnes));
  set('k-cnes-s-pct', pct(stats.igual_cnes)+' do total');
  
  set('k-cnes-n', fmt(stats.diverge_cnes));
  set('k-cnes-n-pct', pct(stats.diverge_cnes)+' do total');
}

function set(id,v){
  const el=document.getElementById(id);
  if(el) el.textContent=v;
}

// ==========================================
// RENDERIZAR GRÁFICOS
// ==========================================
function destroyChart(id){ if(CH[id]){CH[id].destroy();CH[id]=null;} }

const DEF_OPTS = () => ({
  responsive:true, maintainAspectRatio:false,
  scales:{
    x:{ticks:{color:'#8b949e',font:{size:10}},grid:{color:'#30363d'}},
    y:{ticks:{color:'#8b949e',font:{size:10}},grid:{color:'#30363d'}}
  },
  plugins:{legend:{display:false}}
});

function renderCharts(){
  if (!D) return;
  
  // Tipo de Operação (donut)
  {
    const labels=['Inclusão','Alteração','Exclusão'];
    const vals=labels.map(l=>D.op[l]||0);
    const colors=['#3fb950','#2ea8e0','#f85149'];
    destroyChart('op');
    CH['op']=new Chart(document.getElementById('c-op'),{
      type:'doughnut',
      data:{labels,datasets:[{data:vals,backgroundColor:colors,borderColor:'#161b22',borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{position:'right',labels:{color:'#8b949e',font:{size:12},padding:12}}}}
    });
  }

  // Operação x CNES (stacked bar)
  {
    const ops=['Inclusão','Alteração','Exclusão'];
    const dS=ops.map(o=>{const r=D.op_cnes.find(x=>x.no_tipo_operacao_censo===o&&x.st_cnes==='S');return r?r.n:0;});
    const dN=ops.map(o=>{const r=D.op_cnes.find(x=>x.no_tipo_operacao_censo===o&&x.st_cnes==='N');return r?r.n:0;});
    destroyChart('op-cnes');
    CH['op-cnes']=new Chart(document.getElementById('c-op-cnes'),{
      type:'bar',
      data:{labels:ops,datasets:[
        {label:'Igual ao CNES (S)',data:dS,backgroundColor:'#3fb950',borderRadius:3},
        {label:'Diverge (N)',data:dN,backgroundColor:'#f85149',borderRadius:3}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        scales:{x:{stacked:true,ticks:{color:'#8b949e'},grid:{color:'#30363d'}},
                y:{stacked:true,ticks:{color:'#8b949e'},grid:{color:'#30363d'}}},
        plugins:{legend:{labels:{color:'#8b949e',font:{size:11}}}}}
    });
  }

  // Sexo
  {
    const map={'M':'Masculino','F':'Feminino','I':'Não Informado'};
    const labels=Object.keys(D.sexo||{}).map(k=>map[k]||k);
    const vals=Object.values(D.sexo||{});
    const colors=['#bc8cff','#2ea8e0','#8b949e'];
    destroyChart('sexo');
    CH['sexo']=new Chart(document.getElementById('c-sexo'),{
      type:'doughnut',
      data:{labels,datasets:[{data:vals,backgroundColor:colors,borderColor:'#161b22',borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{position:'right',labels:{color:'#8b949e',font:{size:11},padding:8}}}}
    });
  }

  // Raça/Cor
  {
    const labels=Object.keys(D.raca||{});
    const vals=Object.values(D.raca||{});
    const totalRaca = vals.reduce((sum, v) => sum + v, 0);
    const totalVinculos = D.stats?.total_vinculos || 0;
    const invalidos = totalVinculos - totalRaca;
    
    const finalLabels = [...labels];
    const finalVals = [...vals];
    const showInvalidos = document.getElementById('show-invalido-raca')?.checked ?? true;
    
    if(invalidos > 0 && showInvalidos) {
      finalLabels.push('Inválido/Não informado');
      finalVals.push(invalidos);
    }
    
    const colors=['#d29922','#2ea8e0','#3fb950','#f85149','#bc8cff','#ff7b72','#6e7681'];
    destroyChart('raca');
    CH['raca']=new Chart(document.getElementById('c-raca'),{
      type:'bar',
      data:{labels:finalLabels,datasets:[{data:finalVals,backgroundColor:colors,borderRadius:4}]},
      options:{...DEF_OPTS(),plugins:{legend:{display:false}}}
    });
  }

  // Identidade de Gênero
  {
    const labels=Object.keys(D.identidade_genero||{});
    const vals=Object.values(D.identidade_genero||{});
    const totalIdent = vals.reduce((sum, v) => sum + v, 0);
    const totalVinculos = D.stats?.total_vinculos || 0;
    const invalidos = totalVinculos - totalIdent;
    
    const finalLabels = [...labels];
    const finalVals = [...vals];
    const showInvalidos = document.getElementById('show-invalido-ident')?.checked ?? true;
    
    if(invalidos > 0 && showInvalidos) {
      finalLabels.push('Inválido/Não informado');
      finalVals.push(invalidos);
    }
    
    const colors = finalLabels.map((_, i) => i === finalLabels.length - 1 && invalidos > 0 && showInvalidos ? '#6e7681' : '#ff7b72');
    destroyChart('ident');
    CH['ident']=new Chart(document.getElementById('c-ident'),{
      type:'bar',
      data:{labels:finalLabels,datasets:[{data:finalVals,backgroundColor:colors,borderRadius:4}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        scales:{x:{ticks:{color:'#8b949e',font:{size:10}},grid:{color:'#30363d'}},
                y:{ticks:{color:'#8b949e',font:{size:10}},grid:{color:'#30363d'}}},
        plugins:{legend:{display:false}}}
    });
  }

  // Escolaridade
  {
    const labels=Object.keys(D.escolaridade||{});
    const vals=Object.values(D.escolaridade||{});
    const totalEsc = vals.reduce((sum, v) => sum + v, 0);
    const totalVinculos = D.stats?.total_vinculos || 0;
    const invalidos = totalVinculos - totalEsc;
    
    const allLabels = [...labels];
    const allVals = [...vals];
    const showInvalidos = document.getElementById('show-invalido-esc')?.checked ?? true;
    
    if(invalidos > 0 && showInvalidos) {
      allLabels.push('Inválido/Não informado');
      allVals.push(invalidos);
    }
    
    const sorted=allLabels.map((l,i)=>({l,v:allVals[i]})).sort((a,b)=>b.v-a.v);
    const colors = sorted.map(x => x.l === 'Inválido/Não informado' ? '#6e7681' : '#2ea8e0');
    
    destroyChart('esc');
    CH['esc']=new Chart(document.getElementById('c-esc'),{
      type:'bar',
      data:{labels:sorted.map(x=>x.l.length>40?x.l.slice(0,38)+'…':x.l),
            datasets:[{data:sorted.map(x=>x.v),backgroundColor:colors,borderRadius:3}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        scales:{x:{ticks:{color:'#8b949e',font:{size:10}},grid:{color:'#30363d'}},
                y:{ticks:{color:'#8b949e',font:{size:9}},grid:{color:'#30363d'}}},
        plugins:{legend:{display:false}}}
    });
  }

  // CINE
  {
    const entries=Object.entries(D.cine||{}).sort((a,b)=>b[1]-a[1]);
    const totalCine = entries.reduce((sum, e) => sum + e[1], 0);
    const totalVinculos = D.stats?.total_vinculos || 0;
    const invalidos = totalVinculos - totalCine;
    const showInvalidos = document.getElementById('show-invalido-cine')?.checked ?? true;
    
    if(invalidos > 0 && showInvalidos) {
      entries.push(['Inválido/Não informado', invalidos]);
    }
    
    const colors = entries.map(x => x[0] === 'Inválido/Não informado' ? '#6e7681' : '#3fb950');
    
    destroyChart('cine');
    CH['cine']=new Chart(document.getElementById('c-cine'),{
      type:'bar',
      data:{labels:entries.map(x=>x[0]),datasets:[{data:entries.map(x=>x[1]),backgroundColor:colors,borderRadius:3}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        scales:{x:{ticks:{color:'#8b949e',font:{size:10}},grid:{color:'#30363d'}},
                y:{ticks:{color:'#8b949e',font:{size:10}},grid:{color:'#30363d'}}},
        plugins:{legend:{display:false}}}
    });
  }

  // CBO Top 20
  {
    const entries=Object.entries(D.cbo||{}).sort((a,b)=>b[1]-a[1]);
    destroyChart('cbo');
    CH['cbo']=new Chart(document.getElementById('c-cbo'),{
      type:'bar',
      data:{labels:entries.map(x=>x[0].length>35?x[0].slice(0,33)+'…':x[0]),
            datasets:[{data:entries.map(x=>x[1]),backgroundColor:'#d29922',borderRadius:3}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        scales:{x:{ticks:{color:'#8b949e',font:{size:10}},grid:{color:'#30363d'}},
                y:{ticks:{color:'#8b949e',font:{size:9}},grid:{color:'#30363d'}}},
        plugins:{legend:{display:false}}}
    });
  }

  // Vinculação Top 15
  {
    const entries=Object.entries(D.vinculacao||{}).sort((a,b)=>b[1]-a[1]);
    const shortLabel=l=>{
      const parts=l.split(' - ');
      return parts.length>1?parts[0].slice(0,20)+' · '+parts[1].slice(0,18):l.slice(0,35);
    };
    destroyChart('vinc');
    CH['vinc']=new Chart(document.getElementById('c-vinc'),{
      type:'bar',
      data:{labels:entries.map(x=>shortLabel(x[0])),
            datasets:[{data:entries.map(x=>x[1]),backgroundColor:'#bc8cff',borderRadius:3}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        scales:{x:{ticks:{color:'#8b949e',font:{size:10}},grid:{color:'#30363d'}},
                y:{ticks:{color:'#8b949e',font:{size:9}},grid:{color:'#30363d'}}},
        plugins:{legend:{display:false}}}
    });
  }

  // Carga Horária
  {
    const labels=Object.keys(D.ch_faixa||{});
    const vals=Object.values(D.ch_faixa||{});
    const colors=labels.map(l=>{
      if(l==='0h') return '#6e7681';
      if(l==='Inválido (>100h ou <0)') return '#f85149';
      return '#2ea8e0';
    });
    destroyChart('ch');
    CH['ch']=new Chart(document.getElementById('c-ch'),{
      type:'bar',
      data:{labels,datasets:[{data:vals,backgroundColor:colors,borderRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,
        scales:{x:{ticks:{color:'#8b949e',font:{size:11}},grid:{color:'#30363d'}},
                y:{ticks:{color:'#8b949e',font:{size:11}},grid:{color:'#30363d'}}},
        plugins:{legend:{display:false}}}
    });
  }

  // Expectativa
  {
    const labels=Object.keys(D.expectativa||{});
    const vals=Object.values(D.expectativa||{});
    const totalExp = vals.reduce((sum, v) => sum + v, 0);
    const totalVinculos = D.stats?.total_vinculos || 0;
    const invalidos = totalVinculos - totalExp;
    
    const finalLabels = [...labels];
    const finalVals = [...vals];
    const colors = ['#3fb950','#2ea8e0','#d29922','#f85149'];
    const showInvalidos = document.getElementById('show-invalido-exp')?.checked ?? true;
    
    if(invalidos > 0 && showInvalidos) {
      finalLabels.push('Inválido/Não informado');
      finalVals.push(invalidos);
      colors.push('#6e7681');
    }
    
    destroyChart('exp');
    CH['exp']=new Chart(document.getElementById('c-exp'),{
      type:'doughnut',
      data:{labels:finalLabels,datasets:[{data:finalVals,backgroundColor:colors,borderColor:'#161b22',borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{position:'right',labels:{color:'#8b949e',font:{size:11},padding:10}}}}
    });
  }
}

// ==========================================
// TABELA
// ==========================================
function renderTable(){
  const total=filteredTable.length;
  const totalPgs=Math.ceil(total/PG);
  if(page>totalPgs) page=Math.max(1,totalPgs);
  const start=(page-1)*PG;
  const pg=filteredTable.slice(start,start+PG);

  const elem = document.getElementById('tbl-count');
  if (elem) elem.textContent=`(${total.toLocaleString('pt-BR')} registros)`;
  
  const sexoLabel={'M':'Masculino','F':'Feminino','I':'N/I'};
  const opBadge=(op)=>{
    if(op==='Inclusão') return `<span class="badge b-inc">Inclusão</span>`;
    if(op==='Alteração') return `<span class="badge b-alt">Alteração</span>`;
    return `<span class="badge b-exc">Exclusão</span>`;
  };
  const cnesBadge=(v)=>v==='S'?`<span class="badge b-s">S</span>`:`<span class="badge b-n">N</span>`;

  const tbody = document.getElementById('tbl-body');
  if (tbody) {
    tbody.innerHTML=pg.map(r=>`<tr>
      <td style="font-family:'JetBrains Mono',monospace;color:var(--muted)">${r[8]||''}</td>
      <td title="${r[3]||''}">${(r[3]||'').length>40?(r[3]||'').slice(0,38)+'…':r[3]||''}</td>
      <td>${r[4]||''}</td>
      <td>${sexoLabel[r[2]]||r[2]||''}</td>
      <td style="color:var(--muted);font-size:11px">${r[10]||'—'}</td>
      <td style="color:var(--muted)">${r[12]||'—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;text-align:right">${r[5]||0}h</td>
      <td>${opBadge(r[7])}</td>
      <td>${cnesBadge(r[9])}</td>
    </tr>`).join('');
  }
}

function updatePaginationUI(pagination) {
  const info = document.getElementById('pag-info');
  const prev = document.getElementById('btn-prev');
  const next = document.getElementById('btn-next');
  
  if (info) info.textContent=`Página ${pagination.page} de ${pagination.pages} · ${pagination.total.toLocaleString('pt-BR')} registros`;
  if (prev) prev.disabled = pagination.page <= 1;
  if (next) next.disabled = pagination.page >= pagination.pages;
}

async function changePg(dir) {
  await loadTableData(page + dir);
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function srt(idx){
  if(sortIdx===idx) sortDir*=-1; else{sortIdx=idx;sortDir=1;}
  filteredTable.sort((a,b)=>{
    let va=a[idx], vb=b[idx];
    if(typeof va==='string') va=va.toLowerCase();
    if(typeof vb==='string') vb=vb.toLowerCase();
    return va<vb?-sortDir:va>vb?sortDir:0;
  });
  renderTable();
}

// ==========================================
// INICIAR QUANDO PÁGINA CARREGAR
// ==========================================
document.addEventListener('DOMContentLoaded', loadDataFromAPI);
