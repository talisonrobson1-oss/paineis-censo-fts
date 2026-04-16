/**
 * API REST - FioCruz Painéis de Monitoramento
 * VERSÃO CORRIGIDA - Com nomes reais das colunas do banco
 * 
 * Instalação:
 * npm install express pg cors dotenv
 * 
 * Execução:
 * node server.js
 */

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

// ==========================================
// REGIONALIZAÇÃO DF — carregado em memória
// ==========================================
// Mapas: nome_da_região → [cnes1, cnes2, ...]
const dfRegionSaudeMap = {}; // Região de Saúde (DF)
const dfRegionAdmMap   = {}; // Região Administrativa / Município (DF)

(function loadDFRegionalizacao() {
  const csvPath = path.join(__dirname, 'data', 'cnes-df-regionalizacao.csv');
  try {
    const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
    for (let i = 1; i < lines.length; i++) {          // pula o cabeçalho
      const cols = lines[i].trim().split(';');
      if (cols.length < 3) continue;
      const [cnes, regSaude, regAdm] = cols.map(c => c.trim());
      if (!cnes) continue;
      if (!dfRegionSaudeMap[regSaude]) dfRegionSaudeMap[regSaude] = [];
      dfRegionSaudeMap[regSaude].push(cnes);
      if (!dfRegionAdmMap[regAdm]) dfRegionAdmMap[regAdm] = [];
      dfRegionAdmMap[regAdm].push(cnes);
    }
    console.log(`✓ Regionalização DF: ${Object.keys(dfRegionSaudeMap).length} regiões de saúde, ${Object.keys(dfRegionAdmMap).length} regiões administrativas`);
  } catch (err) {
    console.warn('⚠ Arquivo de regionalização DF não encontrado:', csvPath, '—', err.message);
  }
})();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do banco de dados
const pool = new Pool({
  host: process.env.DB_HOST || '177.85.162.132',
  port: process.env.DB_PORT || 54329,
  database: process.env.DB_NAME || 'db_dataware',
  user: process.env.DB_USER || 'usr_censo',
  password: process.env.DB_PASSWORD || 'agsus@censo',
  max: 10, // Limitar a 10 conexões simultâneas (banco remoto não suporta rajadas maiores)
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 60000, // Aumentado para 60s
  query_timeout: 120000, // Aumentado para 120s (2 minutos)
  statement_timeout: 120000, // Timeout de statement
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Tratamento de erros do pool
pool.on('error', (err, client) => {
  console.error('❌ Erro inesperado no pool de conexões:', err);
});

pool.on('connect', (client) => {
  console.log('✅ Nova conexão estabelecida com o banco');
});

pool.on('remove', () => {
  console.log('⚠️ Conexão removida do pool');
});

// Monitorar pool
setInterval(() => {
  console.log(`📊 Pool: ${pool.totalCount} total, ${pool.idleCount} idle, ${pool.waitingCount} waiting`);
}, 30000); // A cada 30 segundos

// Middlewares
app.use(cors());
app.use(express.json());

// ==========================================
// MONITORAMENTO — contadores em memória
// ==========================================
const API_STATS = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  totalErrors: 0,
  endpoints: {}        // { [path]: { calls, errors, totalMs, lastCalledAt } }
};

// Middleware de logging + coleta de métricas
app.use((req, res, next) => {
  // Ignorar health check no contador para não poluir
  const track = req.path !== '/health';
  const startMs = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - startMs;
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '-';
    const status = res.statusCode;
    const isError = status >= 400;

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | ${status} | ${ms}ms | ${ip}`);

    if (track) {
      API_STATS.totalRequests++;
      if (isError) API_STATS.totalErrors++;

      const key = req.path;
      if (!API_STATS.endpoints[key]) {
        API_STATS.endpoints[key] = { calls: 0, errors: 0, totalMs: 0, lastCalledAt: null };
      }
      const ep = API_STATS.endpoints[key];
      ep.calls++;
      ep.totalMs += ms;
      if (isError) ep.errors++;
      ep.lastCalledAt = new Date().toISOString();
    }
  });

  next();
});

// Teste de conexão
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco de dados:', err.message);
  } else {
    console.log('✅ Conectado ao banco de dados PostgreSQL');
  }
});

/**
 * Helper: Construir WHERE clause a partir de filtros
 */
function buildEstabelecimentosWhere(query, additionalConditions = []) {
  const { uf, macrorregiao, regional, municipio, situacao, recenseador, sus, esfera, estrategia, tp_unidade, regiao_saude_df, regiao_adm_df } = query;
  const conditions = [...additionalConditions];
  const params = [];
  let paramCount = 1;

  if (uf) {
    conditions.push(`sg_uf = $${paramCount++}`);
    params.push(uf);
  }
  if (macrorregiao) {
    conditions.push(`no_macrorregional = $${paramCount++}`);
    params.push(macrorregiao);
  }
  if (regional) {
    conditions.push(`no_regional_saude = $${paramCount++}`);
    params.push(regional);
  }
  if (municipio) {
    conditions.push(`no_municipio = $${paramCount++}`);
    params.push(municipio);
  }
  if (situacao) {
    conditions.push(`situacao_recenseamento = $${paramCount++}`);
    params.push(situacao);
  }
  if (recenseador) {
    conditions.push(`recenseador = $${paramCount++}`);
    params.push(recenseador);
  }
  if (estrategia) {
    conditions.push(`estrategia = $${paramCount++}`);
    params.push(estrategia);
  }
  if (sus) {
    conditions.push(`vinculado_sus = $${paramCount++}`);
    params.push(sus);
  }
  if (esfera) {
    conditions.push(`esfera = $${paramCount++}`);
    params.push(esfera);
  }
  if (tp_unidade) {
    conditions.push(`tp_unidade = $${paramCount++}`);
    params.push(tp_unidade);
  }

  // Filtros de Regionalização DF (lookup em memória → filtra por lista de CNES)
  if (regiao_saude_df) {
    const cnesList = dfRegionSaudeMap[regiao_saude_df] || [];
    if (cnesList.length > 0) {
      conditions.push(`co_cnes::text = ANY($${paramCount++})`);
      params.push(cnesList);
    }
  }
  if (regiao_adm_df) {
    const cnesList = dfRegionAdmMap[regiao_adm_df] || [];
    if (cnesList.length > 0) {
      conditions.push(`co_cnes::text = ANY($${paramCount++})`);
      params.push(cnesList);
    }
  }

  return {
    whereClause: conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '',
    params,
    paramCount
  };
}

// ========================================
// ROTAS - PAINEL DE ESTABELECIMENTOS
// ========================================

/**
 * GET /api/estabelecimentos/stats
 */
app.get('/api/estabelecimentos/stats', async (req, res) => {
  try {
    const { whereClause, params } = buildEstabelecimentosWhere(req.query);
    
    const query = `
      SELECT
        COUNT(*) as total_estabelecimentos,
        COUNT(DISTINCT sg_uf) as total_ufs,
        COUNT(DISTINCT situacao_recenseamento) as total_situacoes,
        SUM(CASE WHEN situacao_recenseamento = 'Concluído' THEN 1 ELSE 0 END) as recenseados,
        SUM(CASE WHEN situacao_recenseamento != 'Concluído' OR situacao_recenseamento IS NULL THEN 1 ELSE 0 END) as pendentes,
        COALESCE(SUM(total_vinculos), 0) as total_vinculos
      FROM censo.recenseamento_nova
      ${whereClause};
    `;

    // Contar vínculos recenseados na tabela recenseados_nova filtrada pelo mesmo WHERE
    const vinculosRecenseadosQuery = `
      SELECT COUNT(*) AS n
      FROM censo.recenseados_nova
      WHERE co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova ${whereClause})
    `;

    const [{ rows }, { rows: vrRows }] = await Promise.all([
      pool.query(query, params),
      pool.query(vinculosRecenseadosQuery, params)
    ]);
    const stats = rows[0];

    // Converter para números inteiros
    res.json({
      total_estabelecimentos: parseInt(stats.total_estabelecimentos) || 0,
      total_ufs: parseInt(stats.total_ufs) || 0,
      total_situacoes: parseInt(stats.total_situacoes) || 0,
      recenseados: parseInt(stats.recenseados) || 0,
      pendentes: parseInt(stats.pendentes) || 0,
      total_vinculos: parseInt(stats.total_vinculos) || 0,
      total_vinculos_recenseados: parseInt(vrRows[0].n) || 0
    });
  } catch (err) {
    console.error('Erro em /api/estabelecimentos/stats:', err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas', details: err.message });
  }
});

/**
 * GET /api/estabelecimentos/por-situacao
 */
app.get('/api/estabelecimentos/por-situacao', async (req, res) => {
  try {
    const { whereClause, params } = buildEstabelecimentosWhere(req.query);
    
    const query = `
      SELECT 
        COALESCE(situacao_recenseamento, 'Não informado') as situacao,
        COUNT(*) as quantidade,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentual
      FROM censo.recenseamento_nova
      ${whereClause}
      GROUP BY situacao_recenseamento
      ORDER BY quantidade DESC;
    `;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Erro em /api/estabelecimentos/por-situacao:', err);
    res.status(500).json({ error: 'Erro ao buscar dados por situação', details: err.message });
  }
});

/**
 * GET /api/estabelecimentos/por-uf
 */
app.get('/api/estabelecimentos/por-uf', async (req, res) => {
  try {
    const { whereClause, params } = buildEstabelecimentosWhere(req.query, [
      'sg_uf IS NOT NULL'
    ]);
    
    const query = `
      SELECT 
        sg_uf as uf,
        COUNT(*) as quantidade
      FROM censo.recenseamento_nova
      ${whereClause}
      GROUP BY sg_uf
      ORDER BY quantidade DESC;
    `;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Erro em /api/estabelecimentos/por-uf:', err);
    res.status(500).json({ error: 'Erro ao buscar dados por UF', details: err.message });
  }
});

/**
 * GET /api/estabelecimentos/por-esfera
 */
app.get('/api/estabelecimentos/por-esfera', async (req, res) => {
  try {
    const { whereClause, params } = buildEstabelecimentosWhere(req.query, [
      'esfera IS NOT NULL'
    ]);
    
    const query = `
      SELECT 
        esfera,
        COUNT(*) as quantidade,
        COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentual
      FROM censo.recenseamento_nova
      ${whereClause}
      GROUP BY esfera
      ORDER BY quantidade DESC;
    `;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Erro em /api/estabelecimentos/por-esfera:', err);
    res.status(500).json({ error: 'Erro ao buscar dados por esfera', details: err.message });
  }
});

/**
 * GET /api/estabelecimentos/por-macro
 */
app.get('/api/estabelecimentos/por-macro', async (req, res) => {
  try {
    const { whereClause, params } = buildEstabelecimentosWhere(req.query, [
      'no_macrorregional IS NOT NULL'
    ]);
    
    const query = `
      SELECT 
        no_macrorregional as macrorregiao,
        COUNT(*) as quantidade,
        COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentual
      FROM censo.recenseamento_nova
      ${whereClause}
      GROUP BY no_macrorregional
      ORDER BY quantidade DESC;
    `;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Erro em /api/estabelecimentos/por-macro:', err);
    res.status(500).json({ error: 'Erro ao buscar dados por macrorregião', details: err.message });
  }
});

/**
 * Constrói um CASE WHEN co_cnes::text = ANY($N) THEN 'Região X' ... ELSE fallback END
 * a partir de um mapa { regiao: [cnes...] } e do índice inicial de parâmetro.
 * Retorna { caseExpr, dfParams } para ser anexado aos params existentes.
 */
function buildDFCaseExpr(fallbackCol, dfMap, startParamIdx) {
  const entries = Object.entries(dfMap);
  if (entries.length === 0) return { caseExpr: fallbackCol, dfParams: [] };
  let pi = startParamIdx;
  const dfParams = [];
  const whenClauses = entries.map(([region, cnesList]) => {
    dfParams.push(cnesList);
    return `WHEN co_cnes::text = ANY($${pi++}) THEN '${region.replace(/'/g, "''")}'`;
  });
  return {
    caseExpr: `CASE ${whenClauses.join(' ')} ELSE ${fallbackCol} END`,
    dfParams
  };
}

/**
 * GET /api/estabelecimentos/por-regional
 * Enriquece com classificação DF via CASE expression dinâmico.
 */
app.get('/api/estabelecimentos/por-regional', async (req, res) => {
  try {
    const { whereClause, params } = buildEstabelecimentosWhere(req.query);
    const { caseExpr, dfParams } = buildDFCaseExpr('no_regional_saude', dfRegionSaudeMap, params.length + 1);

    const query = `
      WITH enriched AS (
        SELECT
          ${caseExpr} AS regional,
          sg_uf,
          situacao_recenseamento
        FROM censo.recenseamento_nova
        ${whereClause}
      )
      SELECT
        regional,
        sg_uf,
        COUNT(*) AS total,
        SUM(CASE WHEN situacao_recenseamento = 'Concluído' THEN 1 ELSE 0 END) AS concluidos,
        ROUND(SUM(CASE WHEN situacao_recenseamento = 'Concluído' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS percentual
      FROM enriched
      WHERE regional IS NOT NULL
      GROUP BY regional, sg_uf
      ORDER BY percentual DESC;
    `;
    const { rows } = await pool.query(query, [...params, ...dfParams]);
    res.json(rows);
  } catch (err) {
    console.error('Erro em /api/estabelecimentos/por-regional:', err);
    res.status(500).json({ error: 'Erro ao buscar dados por regional', details: err.message });
  }
});

/**
 * GET /api/estabelecimentos/por-municipio
 * Enriquece com Região Administrativa DF via CASE expression dinâmico.
 */
app.get('/api/estabelecimentos/por-municipio', async (req, res) => {
  try {
    const { whereClause, params } = buildEstabelecimentosWhere(req.query);
    const { caseExpr, dfParams } = buildDFCaseExpr('no_municipio', dfRegionAdmMap, params.length + 1);

    const query = `
      WITH enriched AS (
        SELECT
          ${caseExpr} AS municipio,
          sg_uf
        FROM censo.recenseamento_nova
        ${whereClause}
      )
      SELECT
        municipio,
        sg_uf,
        COUNT(*) AS quantidade
      FROM enriched
      WHERE municipio IS NOT NULL
      GROUP BY municipio, sg_uf
      ORDER BY quantidade DESC
      LIMIT 100;
    `;
    const { rows } = await pool.query(query, [...params, ...dfParams]);
    res.json(rows);
  } catch (err) {
    console.error('Erro em /api/estabelecimentos/por-municipio:', err);
    res.status(500).json({ error: 'Erro ao buscar dados por município', details: err.message });
  }
});

/**
 * GET /api/estabelecimentos/por-recenseador
 */
app.get('/api/estabelecimentos/por-recenseador', async (req, res) => {
  try {
    const query = `
      SELECT 
        recenseador,
        COUNT(*) as total,
        SUM(CASE WHEN situacao_recenseamento = 'Concluído' THEN 1 ELSE 0 END) as concluidos,
        ROUND(SUM(CASE WHEN situacao_recenseamento = 'Concluído' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as percentual
      FROM censo.recenseamento_nova
      WHERE recenseador IS NOT NULL
      GROUP BY recenseador
      ORDER BY total DESC;
    `;
    
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Erro em /api/estabelecimentos/por-recenseador:', err);
    res.status(500).json({ error: 'Erro ao buscar dados por recenseador', details: err.message });
  }
});

/**
 * GET /api/estabelecimentos/lista
 * Retorna lista paginada de estabelecimentos
 */
app.get('/api/estabelecimentos/lista', async (req, res) => {
  try {
    const { page = 1, limit = 50, busca } = req.query;
    const offset = (page - 1) * limit;

    // Usar helper para construir WHERE
    let { whereClause, params, paramCount } = buildEstabelecimentosWhere(req.query);

    // Busca textual (nome, CNES, município)
    if (busca && busca.trim()) {
      const buscaParam = `%${busca.trim()}%`;
      const buscaCond = `(no_fantasia ILIKE $${paramCount} OR co_cnes::text ILIKE $${paramCount} OR no_municipio ILIKE $${paramCount})`;
      whereClause = whereClause ? whereClause + ` AND ${buscaCond}` : `WHERE ${buscaCond}`;
      params.push(buscaParam);
      paramCount++;
    }

    // Count total com filtros
    const countQuery = `SELECT COUNT(*) as total FROM censo.recenseamento_nova ${whereClause}`;
    const { rows: [{ total }] } = await pool.query(countQuery, params);
    
    // Get paginated data com filtros
    const dataQuery = `
      SELECT
        co_cnes,
        no_fantasia,
        sg_uf,
        no_municipio,
        no_regional_saude,
        esfera,
        vinculado_sus,
        total_vinculos,
        recenseador,
        situacao_recenseamento,
        dt_atualizacao
      FROM censo.recenseamento_nova
      ${whereClause}
      ORDER BY no_fantasia
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    const { rows: data } = await pool.query(dataQuery, [...params, limit, offset]);
    
    res.json({
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Erro em /api/estabelecimentos/lista:', err);
    res.status(500).json({ error: 'Erro ao buscar lista de estabelecimentos', details: err.message });
  }
});

/**
 * GET /api/estabelecimentos/filtros
 * Retorna valores únicos para popular os filtros
 */
app.get('/api/estabelecimentos/filtros', async (req, res) => {
  try {
    const [uf, macro, regional, municipio, situacao, esfera, recenseador, estrategia, tp_unidade] = await Promise.all([
      pool.query(`
        SELECT DISTINCT sg_uf as valor
        FROM censo.recenseamento_nova
        WHERE sg_uf IS NOT NULL
        ORDER BY sg_uf
      `),
      pool.query(`
        SELECT DISTINCT no_macrorregional as valor, sg_uf
        FROM censo.recenseamento_nova
        WHERE no_macrorregional IS NOT NULL
        ORDER BY sg_uf, no_macrorregional
      `),
      pool.query(`
        SELECT DISTINCT no_regional_saude as valor, sg_uf
        FROM censo.recenseamento_nova
        WHERE no_regional_saude IS NOT NULL
        ORDER BY sg_uf, no_regional_saude
      `),
      pool.query(`
        SELECT DISTINCT no_municipio as valor, sg_uf
        FROM censo.recenseamento_nova
        WHERE no_municipio IS NOT NULL
        ORDER BY sg_uf, no_municipio
      `),
      pool.query(`
        SELECT DISTINCT situacao_recenseamento as valor
        FROM censo.recenseamento_nova
        WHERE situacao_recenseamento IS NOT NULL
        ORDER BY situacao_recenseamento
      `),
      pool.query(`
        SELECT DISTINCT esfera as valor
        FROM censo.recenseamento_nova
        WHERE esfera IS NOT NULL
        ORDER BY esfera
      `),
      pool.query(`
        SELECT DISTINCT recenseador as valor
        FROM censo.recenseamento_nova
        WHERE recenseador IS NOT NULL
        ORDER BY recenseador
      `),
      pool.query(`
        SELECT DISTINCT estrategia as valor
        FROM censo.recenseamento_nova
        WHERE estrategia IS NOT NULL AND estrategia != ''
        ORDER BY estrategia
      `),
      pool.query(`
        SELECT DISTINCT tp_unidade as valor
        FROM censo.recenseamento_nova
        WHERE tp_unidade IS NOT NULL AND tp_unidade != ''
        ORDER BY tp_unidade
      `)
    ]);

    res.json({
      uf: uf.rows.map(r => r.valor),
      macrorregiao: macro.rows.map(r => ({ valor: r.valor, uf: r.sg_uf })),
      regional: regional.rows.map(r => ({ valor: r.valor, uf: r.sg_uf })),
      municipio: municipio.rows.map(r => ({ valor: r.valor, uf: r.sg_uf })),
      situacao: situacao.rows.map(r => r.valor),
      esfera: esfera.rows.map(r => r.valor),
      recenseador: recenseador.rows.map(r => r.valor),
      estrategia: estrategia.rows.map(r => r.valor),
      tp_unidade: tp_unidade.rows.map(r => r.valor)
    });
  } catch (err) {
    console.error('Erro em /api/estabelecimentos/filtros:', err);
    res.status(500).json({ error: 'Erro ao buscar filtros', details: err.message });
  }
});

/**
 * GET /api/estabelecimentos/filtros-df
 * Retorna as listas de Regiões de Saúde e Regiões Administrativas do DF
 * (carregadas em memória a partir do CSV de regionalização)
 */
app.get('/api/estabelecimentos/filtros-df', (req, res) => {
  res.json({
    regioes_saude_df: Object.keys(dfRegionSaudeMap).sort(),
    regioes_adm_df:   Object.keys(dfRegionAdmMap).sort()
  });
});

// ========================================
// ROTAS - PAINEL DE VÍNCULOS
// ========================================

/**
 * Helper: Construir WHERE clause para vínculos
 */
function buildVinculosWhere(query, additionalConditions = []) {
  const { cbo, vinculo, estabelecimento, sexo, escolaridade, raca, cine, operacao,
          uf, macro, regional, municipio, regiao_saude_df, regiao_adm_df } = query;
  const conditions = [...additionalConditions];
  const params = [];
  let paramCount = 1;

  console.log('🔍 buildVinculosWhere recebeu:', query);

  // ---- Localização (subquery em recenseamento_nova) ----
  if (uf) {
    conditions.push(`co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE sg_uf = $${paramCount++})`);
    params.push(uf);
    console.log('  ✓ Filtro UF aplicado:', uf);
  }
  if (macro) {
    conditions.push(`co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE no_macrorregional = $${paramCount++})`);
    params.push(macro);
    console.log('  ✓ Filtro Macro aplicado:', macro);
  }
  if (regional) {
    conditions.push(`co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE no_regional_saude = $${paramCount++})`);
    params.push(regional);
    console.log('  ✓ Filtro Regional aplicado:', regional);
  }
  if (municipio) {
    conditions.push(`co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE no_municipio = $${paramCount++})`);
    params.push(municipio);
    console.log('  ✓ Filtro Município aplicado:', municipio);
  }
  if (regiao_saude_df && dfRegionSaudeMap[regiao_saude_df]) {
    const cnesList = dfRegionSaudeMap[regiao_saude_df].map(String);
    conditions.push(`co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE co_cnes::text = ANY($${paramCount++}))`);
    params.push(cnesList);
    console.log('  ✓ Filtro Região de Saúde DF aplicado:', regiao_saude_df);
  }
  if (regiao_adm_df && dfRegionAdmMap[regiao_adm_df]) {
    const cnesList = dfRegionAdmMap[regiao_adm_df].map(String);
    conditions.push(`co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE co_cnes::text = ANY($${paramCount++}))`);
    params.push(cnesList);
    console.log('  ✓ Filtro Região Administrativa DF aplicado:', regiao_adm_df);
  }
  
  // CBO: buscar por código OU descrição (formato: "código - descrição")
  // co_cbo_ocupacao é int4 na nova tabela — cast para text para aceitar comparação com param string
  if (cbo) {
    conditions.push(`(co_cbo_ocupacao::text = $${paramCount} OR ds_cbo_ocupacao = $${paramCount})`);
    params.push(cbo);
    paramCount++;
    console.log('  ✓ Filtro CBO aplicado:', cbo);
  }
  
  // Vínculo: buscar por código OU descrição (formato: "código - descrição")
  if (vinculo) {
    conditions.push(`(nu_vinculacao = $${paramCount} OR vinculacao = $${paramCount})`);
    params.push(vinculo);
    paramCount++;
    console.log('  ✓ Filtro Vínculo aplicado:', vinculo);
  }
  
  // Estabelecimento: código CNES
  if (estabelecimento) {
    conditions.push(`co_cnes = $${paramCount++}`);
    params.push(estabelecimento);
    console.log('  ✓ Filtro Estabelecimento aplicado:', estabelecimento);
  }
  
  // Sexo: M/1 = Masculino, F/2 = Feminino
  if (sexo) {
    if (sexo === 'M' || sexo === 'Masculino') {
      conditions.push(`co_sexo IN ('M', '1')`);
      console.log('  ✓ Filtro Sexo aplicado: Masculino (M/1)');
    } else if (sexo === 'F' || sexo === 'Feminino') {
      conditions.push(`co_sexo IN ('F', '2')`);
      console.log('  ✓ Filtro Sexo aplicado: Feminino (F/2)');
    }
  }
  
  // Escolaridade: buscar por código OU descrição
  // co_escolaridade é int2 na nova tabela — cast para text
  if (escolaridade) {
    conditions.push(`(co_escolaridade::text = $${paramCount} OR ds_escolaridade = $${paramCount})`);
    params.push(escolaridade);
    paramCount++;
    console.log('  ✓ Filtro Escolaridade aplicado:', escolaridade);
  }
  
  // Raça/Cor
  if (raca) {
    if (raca === 'Sem informação') {
      // Filtrar por nulos, vazios ou "SEM INFORMACAO"
      conditions.push(`(ds_raca_cor IS NULL OR ds_raca_cor = '' OR UPPER(ds_raca_cor) = 'SEM INFORMACAO')`);
      console.log('  ✓ Filtro Raça aplicado: Sem informação (NULL, vazio ou SEM INFORMACAO)');
    } else {
      conditions.push(`ds_raca_cor = $${paramCount++}`);
      params.push(raca);
      console.log('  ✓ Filtro Raça aplicado:', raca);
    }
  }
  
  // CINE: buscar por código OU descrição
  if (cine) {
    conditions.push(`(co_cine = $${paramCount} OR ds_cine = $${paramCount})`);
    params.push(cine);
    paramCount++;
    console.log('  ✓ Filtro CINE aplicado:', cine);
  }
  
  // Tipo de Operação
  if (operacao) {
    conditions.push(`no_tipo_operacao_censo = $${paramCount++}`);
    params.push(operacao);
    console.log('  ✓ Filtro Operação aplicado:', operacao);
  }
  
  const result = {
    whereClause: conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '',
    params,
    paramCount
  };
  
  console.log('📝 WHERE gerado:', result.whereClause);
  console.log('📝 Params:', result.params);
  
  return result;
}

/**
 * GET /api/vinculos/stats
 */
app.get('/api/vinculos/stats', async (req, res) => {
  try {
    const { whereClause, params } = buildVinculosWhere(req.query);
    
    const query = `
      SELECT 
        COUNT(*) as total_vinculos,
        COUNT(DISTINCT nu_cpf) as total_profissionais,
        COUNT(DISTINCT co_cnes) as total_cnes,
        ROUND(AVG(
          COALESCE(qt_carga_horaria_ambulatorial, 0) + 
          COALESCE(qt_carga_horaria_hospitalar, 0) + 
          COALESCE(qt_carga_horaria_outros, 0)
        )) as media_carga_horaria,
        SUM(CASE WHEN no_tipo_operacao_censo = 'Inclusão' THEN 1 ELSE 0 END) as inclusoes,
        SUM(CASE WHEN no_tipo_operacao_censo = 'Alteração' THEN 1 ELSE 0 END) as alteracoes,
        SUM(CASE WHEN no_tipo_operacao_censo = 'Exclusão' THEN 1 ELSE 0 END) as exclusoes,
        SUM(CASE WHEN st_cnes = 'S' THEN 1 ELSE 0 END) as igual_cnes,
        SUM(CASE WHEN st_cnes = 'N' THEN 1 ELSE 0 END) as diverge_cnes
      FROM censo.recenseados_nova
      ${whereClause};
    `;
    
    const { rows } = await pool.query(query, params);
    const stats = rows[0];
    
    // Converter para números inteiros
    res.json({
      total_vinculos: parseInt(stats.total_vinculos) || 0,
      total_profissionais: parseInt(stats.total_profissionais) || 0,
      total_cnes: parseInt(stats.total_cnes) || 0,
      media_carga_horaria: parseInt(stats.media_carga_horaria) || 0,
      inclusoes: parseInt(stats.inclusoes) || 0,
      alteracoes: parseInt(stats.alteracoes) || 0,
      exclusoes: parseInt(stats.exclusoes) || 0,
      igual_cnes: parseInt(stats.igual_cnes) || 0,
      diverge_cnes: parseInt(stats.diverge_cnes) || 0
    });
  } catch (err) {
    console.error('Erro em /api/vinculos/stats:', err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas de vínculos', details: err.message });
  }
});

/**
 * GET /api/vinculos/agregados
 */
app.get('/api/vinculos/agregados', async (req, res) => {
  try {
    const { whereClause, params } = buildVinculosWhere(req.query);
    
    // Função helper para executar query com ou sem params
    const executeQuery = (query) => {
      return params.length > 0 ? pool.query(query, params) : pool.query(query);
    };
    
    console.log('📊 Executando LOTE 1 (4 queries)...');
    // LOTE 1: Queries principais (4 queries)
    const [operacao, operacaoCnes, sexo, raca] = await Promise.all([
      // Tipo de Operação (SEM incluir não alterados quando há filtros)
      executeQuery(`
        SELECT 
          no_tipo_operacao_censo as tipo, 
          COUNT(*) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + ' AND no_tipo_operacao_censo IS NOT NULL' : 'WHERE no_tipo_operacao_censo IS NOT NULL'}
        GROUP BY no_tipo_operacao_censo
      `),
      
      // Operação x CNES
      executeQuery(`
        SELECT no_tipo_operacao_censo, st_cnes, COUNT(*) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + ' AND no_tipo_operacao_censo IS NOT NULL' : 'WHERE no_tipo_operacao_censo IS NOT NULL'}
        GROUP BY no_tipo_operacao_censo, st_cnes
      `),
      
      // Sexo (unificado: M/1=Masculino, F/2=Feminino, resto=Inválido)
      executeQuery(`
        SELECT 
          CASE 
            WHEN co_sexo IN ('M', '1') THEN 'Masculino'
            WHEN co_sexo IN ('F', '2') THEN 'Feminino'
            ELSE 'Inválido/Não informado'
          END as sexo,
          COUNT(*) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + " AND co_sexo IS NOT NULL AND co_sexo != ''" : "WHERE co_sexo IS NOT NULL AND co_sexo != ''"}
        GROUP BY 
          CASE 
            WHEN co_sexo IN ('M', '1') THEN 'Masculino'
            WHEN co_sexo IN ('F', '2') THEN 'Feminino'
            ELSE 'Inválido/Não informado'
          END
      `),
      
      // Raça/Cor
      executeQuery(`
        SELECT 
          CASE 
            WHEN ds_raca_cor IS NULL OR ds_raca_cor = '' OR UPPER(ds_raca_cor) = 'SEM INFORMAÇÃO' 
            THEN 'Sem informação'
            ELSE ds_raca_cor
          END as raca, 
          COUNT(*) as n
        FROM censo.recenseados_nova
        ${whereClause}
        GROUP BY 
          CASE 
            WHEN ds_raca_cor IS NULL OR ds_raca_cor = '' OR UPPER(ds_raca_cor) = 'SEM INFORMAÇÃO' 
            THEN 'Sem informação'
            ELSE ds_raca_cor
          END
      `)
    ]);
    
    console.log('✅ LOTE 1 concluído');
    
    // Pequeno delay para não sobrecarregar pool
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('📊 Executando LOTE 2 (4 queries)...');
    // LOTE 2: Queries secundárias (4 queries)
    const [identidadeGenero, escolaridade, cine, cbo] = await Promise.all([
      // Identidade de Gênero
      executeQuery(`
        SELECT ds_identidade_genero as identidade, COUNT(*) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + " AND ds_identidade_genero IS NOT NULL AND ds_identidade_genero != ''" : "WHERE ds_identidade_genero IS NOT NULL AND ds_identidade_genero != ''"}
        GROUP BY ds_identidade_genero
      `),
      
      // Escolaridade
      executeQuery(`
        SELECT ds_escolaridade as escolaridade, COUNT(*) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + " AND ds_escolaridade IS NOT NULL AND ds_escolaridade != ''" : "WHERE ds_escolaridade IS NOT NULL AND ds_escolaridade != ''"}
        GROUP BY ds_escolaridade
      `),
      
      // Área de Formação (CINE) - Top 15
      executeQuery(`
        SELECT ds_cine as cine, COUNT(*) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + " AND ds_cine IS NOT NULL AND ds_cine != ''" : "WHERE ds_cine IS NOT NULL AND ds_cine != ''"}
        GROUP BY ds_cine
        ORDER BY n DESC
        LIMIT 15
      `),
      
      // CBO - Top 20
      executeQuery(`
        SELECT ds_cbo_ocupacao as cbo, COUNT(*) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + " AND ds_cbo_ocupacao IS NOT NULL AND ds_cbo_ocupacao != ''" : "WHERE ds_cbo_ocupacao IS NOT NULL AND ds_cbo_ocupacao != ''"}
        GROUP BY ds_cbo_ocupacao
        ORDER BY n DESC
        LIMIT 20
      `)
    ]);
    
    console.log('✅ LOTE 2 concluído');
    
    // Pequeno delay para não sobrecarregar pool
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('📊 Executando LOTE 3 (4 queries)...');
    // LOTE 3: Queries finais (4 queries)
    const [vinculacao, cargaHoraria, expectativa, estrategia] = await Promise.all([
      // Tipo de Vinculação - Top 15
      executeQuery(`
        SELECT vinculacao, COUNT(*) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + " AND vinculacao IS NOT NULL AND vinculacao != ''" : "WHERE vinculacao IS NOT NULL AND vinculacao != ''"}
        GROUP BY vinculacao
        ORDER BY n DESC
        LIMIT 15
      `),
      
      // Carga Horária (faixas) - soma das 3 colunas
      executeQuery(`
        WITH ch_calculado AS (
          SELECT 
            COALESCE(qt_carga_horaria_ambulatorial, 0) + 
            COALESCE(qt_carga_horaria_hospitalar, 0) + 
            COALESCE(qt_carga_horaria_outros, 0) as ch_total
          FROM censo.recenseados_nova
          ${whereClause}
        ),
        faixas AS (
          SELECT 
            CASE 
              WHEN ch_total = 0 THEN '0h'
              WHEN ch_total > 0 AND ch_total <= 10 THEN '1-10h'
              WHEN ch_total > 10 AND ch_total <= 20 THEN '11-20h'
              WHEN ch_total > 20 AND ch_total <= 30 THEN '21-30h'
              WHEN ch_total > 30 AND ch_total <= 40 THEN '31-40h'
              WHEN ch_total > 40 AND ch_total <= 50 THEN '41-50h'
              WHEN ch_total > 50 AND ch_total <= 60 THEN '51-60h'
              WHEN ch_total > 60 AND ch_total <= 70 THEN '61-70h'
              WHEN ch_total > 70 AND ch_total <= 80 THEN '71-80h'
              WHEN ch_total > 80 AND ch_total <= 90 THEN '81-90h'
              WHEN ch_total > 90 AND ch_total <= 100 THEN '91-100h'
              ELSE 'Inválido (>100h ou <0)'
            END as faixa
          FROM ch_calculado
        )
        SELECT 
          faixa,
          COUNT(*) as n
        FROM faixas
        GROUP BY faixa
        ORDER BY 
          CASE faixa
            WHEN '0h' THEN 0
            WHEN '1-10h' THEN 1
            WHEN '11-20h' THEN 2
            WHEN '21-30h' THEN 3
            WHEN '31-40h' THEN 4
            WHEN '41-50h' THEN 5
            WHEN '51-60h' THEN 6
            WHEN '61-70h' THEN 7
            WHEN '71-80h' THEN 8
            WHEN '81-90h' THEN 9
            WHEN '91-100h' THEN 10
            ELSE 11
          END
      `),
      
      // Expectativa Profissional
      executeQuery(`
        SELECT no_expectativa_profissional as expectativa, COUNT(*) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + " AND no_expectativa_profissional IS NOT NULL AND no_expectativa_profissional != ''" : "WHERE no_expectativa_profissional IS NOT NULL AND no_expectativa_profissional != ''"}
        GROUP BY no_expectativa_profissional
      `),

      // Estratégia — LEFT JOIN com DISTINCT ON para evitar multiplicação de linhas
      // e garantir que a soma de todos os valores = Total de Vínculos
      (() => {
        const estrategiaWhere = whereClause
          ? whereClause.replace(/\bco_cnes\b/g, 'v.co_cnes')
          : '';
        const sql = `
          SELECT COALESCE(NULLIF(r.estrategia, ''), 'Não informado') AS estrategia,
                 COUNT(*) AS n
          FROM censo.recenseados_nova v
          LEFT JOIN (
            SELECT DISTINCT ON (co_cnes) co_cnes, estrategia
            FROM censo.recenseamento_nova
            ORDER BY co_cnes, coletado_em DESC
          ) r ON r.co_cnes = v.co_cnes
          ${estrategiaWhere}
          GROUP BY COALESCE(NULLIF(r.estrategia, ''), 'Não informado')
          ORDER BY n DESC
        `;
        return params.length > 0 ? pool.query(sql, params) : pool.query(sql);
      })()
    ]);

    console.log('✅ LOTE 3 concluído');
    console.log('✅ Todas as queries de agregados concluídas com sucesso');

    res.json({
      operacao: operacao.rows,
      operacaoCnes: operacaoCnes.rows,
      sexo: sexo.rows,
      raca: raca.rows,
      identidadeGenero: identidadeGenero.rows,
      escolaridade: escolaridade.rows,
      cine: cine.rows,
      cbo: cbo.rows,
      vinculacao: vinculacao.rows,
      cargaHoraria: cargaHoraria.rows,
      expectativa: expectativa.rows,
      estrategia: estrategia.rows
    });
  } catch (err) {
    console.error('Erro em /api/vinculos/agregados:', err);
    res.status(500).json({ error: 'Erro ao buscar dados agregados', details: err.message });
  }
});

/**
 * GET /api/vinculos/tabela
 */
app.get('/api/vinculos/tabela', async (req, res) => {
  try {
    const { page = 1, limit = 30, busca } = req.query;
    const offset = (page - 1) * limit;

    // Usar helper para construir WHERE com todos os filtros
    let { whereClause, params, paramCount } = buildVinculosWhere(req.query);

    // Busca textual (CBO, CNES)
    if (busca && busca.trim()) {
      const buscaParam = `%${busca.trim()}%`;
      const buscaCond = `(ds_cbo_ocupacao ILIKE $${paramCount} OR co_cnes::text ILIKE $${paramCount} OR vinculacao ILIKE $${paramCount})`;
      whereClause = whereClause ? whereClause + ` AND ${buscaCond}` : `WHERE ${buscaCond}`;
      params.push(buscaParam);
      paramCount++;
    }

    console.log('📋 Tabela - WHERE:', whereClause);
    console.log('📋 Tabela - Params:', params);

    // Chave de deduplicação: 8 campos que identificam um vínculo único
    const dedupKey = `nu_cpf, co_cnes, co_cbo_ocupacao, nu_vinculacao,
      COALESCE(qt_carga_horaria_ambulatorial::text, ''), COALESCE(qt_carga_horaria_hospitalar::text, ''),
      COALESCE(qt_carga_horaria_outros::text, ''), no_tipo_operacao_censo`;

    // Query para contar total (deduplificado)
    const countQuery = `
      SELECT COUNT(*) as total
      FROM (
        SELECT DISTINCT ON (${dedupKey}) nu_cpf
        FROM censo.recenseados_nova
        ${whereClause}
        ORDER BY ${dedupKey}
      ) sub
    `;

    const { rows: [{ total }] } = await pool.query(countQuery, params);

    // Query para dados paginados (deduplificado)
    const dataQuery = `
      SELECT *
      FROM (
        SELECT DISTINCT ON (${dedupKey})
          SUBSTRING(nu_cpf, 8, 4) as cpf_ultimos_4,
          nu_cpf,
          co_sexo,
          ds_cbo_ocupacao,
          vinculacao,
          COALESCE(qt_carga_horaria_ambulatorial, 0) +
          COALESCE(qt_carga_horaria_hospitalar, 0) +
          COALESCE(qt_carga_horaria_outros, 0) as carga_horaria_total,
          vl_remuneracao,
          no_tipo_operacao_censo,
          co_cnes,
          st_cnes,
          ds_escolaridade,
          ds_raca_cor,
          ds_cine
        FROM censo.recenseados_nova
        ${whereClause}
        ORDER BY ${dedupKey}
      ) t
      ORDER BY nu_cpf
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const { rows: data } = await pool.query(dataQuery, [...params, limit, offset]);

    res.json({
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Erro em /api/vinculos/tabela:', err);
    res.status(500).json({ error: 'Erro ao buscar tabela de vínculos', details: err.message });
  }
});

/**
 * GET /api/vinculos/filtros
 * Cache em memória por 60 min — valores mudam raramente e as queries são pesadas.
 */
let _filtrosVinculosCache = null;
let _filtrosVinculosCacheTs = 0;
const FILTROS_VINCULOS_TTL = 60 * 60 * 1000; // 60 minutos

app.get('/api/vinculos/filtros', async (req, res) => {
  // Servir do cache se ainda válido
  if (_filtrosVinculosCache && (Date.now() - _filtrosVinculosCacheTs) < FILTROS_VINCULOS_TTL) {
    console.log('📦 /api/vinculos/filtros — servindo do cache');
    return res.json(_filtrosVinculosCache);
  }

  try {
    console.log('🔍 /api/vinculos/filtros — executando queries...');

    // LOTE 1: Filtros principais (3 queries)
    const [escolaridade, raca, cine] = await Promise.all([
      pool.query(`
        SELECT DISTINCT
          co_escolaridade as codigo,
          ds_escolaridade as descricao,
          co_escolaridade::text || ' - ' || ds_escolaridade as valor
        FROM censo.recenseados_nova
        WHERE co_escolaridade IS NOT NULL AND ds_escolaridade IS NOT NULL
          AND ds_escolaridade != ''
        ORDER BY co_escolaridade
      `),
      pool.query(`
        SELECT DISTINCT
          CASE
            WHEN ds_raca_cor IS NULL OR ds_raca_cor = '' OR UPPER(ds_raca_cor) = 'SEM INFORMACAO'
            THEN 'Sem informação'
            ELSE ds_raca_cor
          END as valor
        FROM censo.recenseados_nova
        WHERE ds_raca_cor IS NOT NULL
        ORDER BY 1
      `),
      pool.query(`
        SELECT DISTINCT
          co_cine as codigo,
          ds_cine as descricao,
          co_cine || ' - ' || ds_cine as valor
        FROM censo.recenseados_nova
        WHERE co_cine IS NOT NULL AND ds_cine IS NOT NULL
          AND co_cine != '' AND ds_cine != ''
        ORDER BY co_cine
        LIMIT 500
      `)
    ]);

    // LOTE 2: Filtros restantes (3 queries)
    const [cbo, vinculo, estabelecimentos] = await Promise.all([
      pool.query(`
        SELECT DISTINCT
          co_cbo_ocupacao as codigo,
          ds_cbo_ocupacao as descricao,
          co_cbo_ocupacao::text || ' - ' || ds_cbo_ocupacao as valor
        FROM censo.recenseados_nova
        WHERE co_cbo_ocupacao IS NOT NULL AND ds_cbo_ocupacao IS NOT NULL
          AND ds_cbo_ocupacao != ''
        ORDER BY co_cbo_ocupacao
        LIMIT 1000
      `),
      pool.query(`
        SELECT DISTINCT
          nu_vinculacao as codigo,
          vinculacao as descricao,
          nu_vinculacao || ' - ' || vinculacao as valor
        FROM censo.recenseados_nova
        WHERE nu_vinculacao IS NOT NULL AND vinculacao IS NOT NULL
          AND nu_vinculacao != '' AND vinculacao != ''
        ORDER BY nu_vinculacao
        LIMIT 200
      `),
      pool.query(`
        SELECT DISTINCT
          r.co_cnes as codigo,
          r.no_razao_social as descricao,
          r.co_cnes || ' - ' || r.no_razao_social as valor
        FROM censo.recenseamento_nova r
        INNER JOIN censo.recenseados_nova v ON r.co_cnes = v.co_cnes
        WHERE r.co_cnes IS NOT NULL AND r.no_razao_social IS NOT NULL
        ORDER BY r.co_cnes
      `)
    ]);

    const resultado = {
      escolaridade: escolaridade.rows.map(r => ({ codigo: r.codigo, descricao: r.descricao, valor: r.valor })),
      raca: raca.rows.map(r => r.valor),
      cine: cine.rows.map(r => ({ codigo: r.codigo, descricao: r.descricao, valor: r.valor })),
      cbo: cbo.rows.map(r => ({ codigo: r.codigo, descricao: r.descricao, valor: r.valor })),
      vinculo: vinculo.rows.map(r => ({ codigo: r.codigo, descricao: r.descricao, valor: r.valor })),
      estabelecimentos: estabelecimentos.rows.map(r => ({ codigo: r.codigo, descricao: r.descricao, valor: r.valor }))
    };

    // Armazena no cache
    _filtrosVinculosCache = resultado;
    _filtrosVinculosCacheTs = Date.now();
    console.log('✅ /api/vinculos/filtros — cache atualizado');

    res.json(resultado);
  } catch (err) {
    console.error('Erro em /api/vinculos/filtros:', err);
    res.status(500).json({ error: 'Erro ao buscar filtros', details: err.message });
  }
});

/**
 * GET /api/vinculos/nao-alterados
 * Retorna análise de vínculos não alterados pelo projeto (comparação com espelho CNES)
 * Usa competência mais antiga: Agosto/2025 (202508)
 */
app.get('/api/vinculos/nao-alterados', async (req, res) => {
  try {
    const competencia = '202508'; // Agosto/2025 - competência mais antiga
    
    // Total de vínculos no espelho CNES (Ago/2025)
    const totalQuery = `
      SELECT COUNT(*) as total
      FROM censo.espelho_cnes_nova
      WHERE nu_comp::text = $1
    `;
    const totalResult = await pool.query(totalQuery, [competencia]);
    const totalEspelho = parseInt(totalResult.rows[0].total);
    
    // Vínculos alterados pelo projeto (que existem no recenseamento)
    const alteradosQuery = `
      SELECT COUNT(DISTINCT e.co_cpf || '|' || e.co_cnes) as alterados
      FROM censo.espelho_cnes_nova e
      INNER JOIN censo.recenseados_nova v
        ON e.co_cpf = v.nu_cpf
        AND e.co_cnes = v.co_cnes
      WHERE e.nu_comp::text = $1
    `;
    const alteradosResult = await pool.query(alteradosQuery, [competencia]);
    const alterados = parseInt(alteradosResult.rows[0].alterados);
    
    const naoAlterados = totalEspelho - alterados;
    const cobertura = totalEspelho > 0 ? ((alterados / totalEspelho) * 100).toFixed(1) : 0;
    
    res.json({
      competencia: competencia,
      label: 'Ago/2025',
      total_espelho: totalEspelho,
      alterados: alterados,
      nao_alterados: naoAlterados,
      cobertura: parseFloat(cobertura)
    });
    
  } catch (err) {
    console.error('Erro em /api/vinculos/nao-alterados:', err);
    res.status(500).json({ error: 'Erro ao buscar vínculos não alterados', details: err.message });
  }
});

// ========================================
// ROTAS - PAINEL DE RESOLUÇÃO
// ========================================

/**
 * Helper: Construir WHERE clause para filtros de resolução
 */
function buildResolucaoWhere(filters) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  console.log('🔍 buildResolucaoWhere recebeu:', filters);

  // Filtro: UF
  if (filters.uf) {
    conditions.push(`r.sg_uf = $${paramIndex}`);
    params.push(filters.uf);
    paramIndex++;
    console.log(`  ✓ Filtro UF aplicado: ${filters.uf}`);
  }

  // Filtro: Macrorregião
  if (filters.macro) {
    conditions.push(`r.no_macrorregional = $${paramIndex}`);
    params.push(filters.macro);
    paramIndex++;
    console.log(`  ✓ Filtro Macro aplicado: ${filters.macro}`);
  }

  // Filtro: Região de Saúde
  if (filters.regional) {
    conditions.push(`r.no_regional_saude = $${paramIndex}`);
    params.push(filters.regional);
    paramIndex++;
    console.log(`  ✓ Filtro Regional aplicado: ${filters.regional}`);
  }

  // Filtro: Município
  if (filters.municipio) {
    conditions.push(`r.no_municipio = $${paramIndex}`);
    params.push(filters.municipio);
    paramIndex++;
    console.log(`  ✓ Filtro Município aplicado: ${filters.municipio}`);
  }

  // Filtro: Região de Saúde DF (classificação própria via CNES)
  if (filters.regiao_saude_df && dfRegionSaudeMap[filters.regiao_saude_df]) {
    const cnesList = dfRegionSaudeMap[filters.regiao_saude_df].map(String);
    conditions.push(`r.co_cnes::text = ANY($${paramIndex++})`);
    params.push(cnesList);
    console.log(`  ✓ Filtro Região de Saúde DF aplicado: ${filters.regiao_saude_df}`);
  }

  // Filtro: Região Administrativa DF (classificação própria via CNES)
  if (filters.regiao_adm_df && dfRegionAdmMap[filters.regiao_adm_df]) {
    const cnesList = dfRegionAdmMap[filters.regiao_adm_df].map(String);
    conditions.push(`r.co_cnes::text = ANY($${paramIndex++})`);
    params.push(cnesList);
    console.log(`  ✓ Filtro Região Administrativa DF aplicado: ${filters.regiao_adm_df}`);
  }

  // Filtro: Recenseador
  if (filters.recenseador) {
    conditions.push(`r.recenseador = $${paramIndex}`);
    params.push(filters.recenseador);
    paramIndex++;
    console.log(`  ✓ Filtro Recenseador aplicado: ${filters.recenseador}`);
  }

  // Filtro: Tipo de Operação (aceita 'op' ou 'operacao')
  if (filters.op || filters.operacao) {
    conditions.push(`v.no_tipo_operacao_censo = $${paramIndex}`);
    params.push(filters.op || filters.operacao);
    paramIndex++;
    console.log(`  ✓ Filtro Operação aplicado: ${filters.op || filters.operacao}`);
  }

  // Filtro: CBO (busca por código OU descrição)
  if (filters.cbo) {
    conditions.push(`(v.co_cbo_ocupacao = $${paramIndex} OR v.ds_cbo_ocupacao = $${paramIndex})`);
    params.push(filters.cbo);
    paramIndex++;
    console.log(`  ✓ Filtro CBO aplicado: ${filters.cbo}`);
  }

  // Filtro: Estabelecimento (busca por CNES OU razão social)
  if (filters.estabelecimento) {
    conditions.push(`(v.co_cnes = $${paramIndex} OR r.no_razao_social = $${paramIndex})`);
    params.push(filters.estabelecimento);
    paramIndex++;
    console.log(`  ✓ Filtro Estabelecimento aplicado: ${filters.estabelecimento}`);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  
  console.log('📝 WHERE gerado:', whereClause);
  console.log('📝 Params:', params);

  return { whereClause, params };
}

// ==========================================
// CHAVES ÚNICAS DE VÍNCULO (7 campos)
// ==========================================
// CPF + CNES + CBO + Tipo Vínculo + Carga Ambulatorial + Carga Hospitalar + Carga Outros
const CHAVE_VINCULO = "nu_cpf || '|' || co_cnes || '|' || co_cbo_ocupacao::text || '|' || nu_vinculacao || '|' || COALESCE(qt_carga_horaria_ambulatorial::text, '') || '|' || COALESCE(qt_carga_horaria_hospitalar::text, '') || '|' || COALESCE(qt_carga_horaria_outros::text, '')";

const CHAVE_V = "v.nu_cpf || '|' || v.co_cnes || '|' || v.co_cbo_ocupacao::text || '|' || v.nu_vinculacao || '|' || COALESCE(v.qt_carga_horaria_ambulatorial::text, '') || '|' || COALESCE(v.qt_carga_horaria_hospitalar::text, '') || '|' || COALESCE(v.qt_carga_horaria_outros::text, '')";

// CASE de resolução equalizado com os Indicadores Principais (requer LEFT JOIN no espelho)
// Inclusão resolvida  → EXISTS no espelho (e.co_cpf IS NOT NULL)
// Exclusão resolvida  → NÃO existe no espelho (e.co_cpf IS NULL)
// Alteração resolvida → EXISTS no espelho COM carga horária diferente
const RESOLVIDA_CASE_V = `CASE
  WHEN v.no_tipo_operacao_censo = 'Inclusão' AND e.co_cpf IS NOT NULL
    THEN ${CHAVE_V}
  WHEN v.no_tipo_operacao_censo = 'Exclusão' AND e.co_cpf IS NULL
    THEN ${CHAVE_V}
  WHEN v.no_tipo_operacao_censo = 'Alteração' AND e.co_cpf IS NOT NULL AND (
      COALESCE(v.qt_carga_horaria_ambulatorial::numeric, 0) != COALESCE(e.qt_carga_horaria_ambulatorial::numeric, 0)
      OR COALESCE(v.qt_carga_horaria_hospitalar::numeric, 0) != COALESCE(e.qt_carga_hor_hosp_sus::numeric, 0)
      OR COALESCE(v.qt_carga_horaria_outros::numeric, 0) != COALESCE(e.qt_carga_horaria_outros::numeric, 0)
    ) THEN ${CHAVE_V}
END`;

// Versão para evolução temporal (usa INNER JOIN, Exclusão não é rastreável por competência)
const RESOLVIDA_CASE_EVOLUCAO = `CASE
  WHEN v.no_tipo_operacao_censo = 'Inclusão'
    THEN ${CHAVE_V}
  WHEN v.no_tipo_operacao_censo = 'Alteração' AND (
      COALESCE(v.qt_carga_horaria_ambulatorial::numeric, 0) != COALESCE(e.qt_carga_horaria_ambulatorial::numeric, 0)
      OR COALESCE(v.qt_carga_horaria_hospitalar::numeric, 0) != COALESCE(e.qt_carga_hor_hosp_sus::numeric, 0)
      OR COALESCE(v.qt_carga_horaria_outros::numeric, 0) != COALESCE(e.qt_carga_horaria_outros::numeric, 0)
    ) THEN ${CHAVE_V}
END`;

/**
 * GET /api/resolucao/stats
 * KPIs principais do painel de resolução
 */
app.get('/api/resolucao/stats', async (req, res) => {
  try {
    const { whereClause, params } = buildResolucaoWhere(req.query);
    const competencia = req.query.comp || req.query.competencia || null; // Aceitar 'comp' ou 'competencia'

    console.log('📊 /api/resolucao/stats chamado');
    console.log('📊 Competência recebida:', competencia || 'TODAS');
    console.log('📊 Query params:', req.query);

    // Se competência específica
    const compFilter = competencia ? `AND e.nu_comp = '${competencia}'` : '';
    
    // Verificar se há filtros que exigem JOIN com recenseamento
    const needsRecenseamentoJoin = !!(
      req.query.uf || 
      req.query.macro || 
      req.query.regional || 
      req.query.municipio || 
      req.query.recenseador ||
      req.query.estabelecimento  // estabelecimento também precisa de r.no_razao_social
    );
    
    // JOIN com recenseamento (apenas se necessário)
    const recenseamentoJoin = needsRecenseamentoJoin 
      ? 'INNER JOIN censo.recenseamento_nova r ON v.co_cnes = r.co_cnes' 
      : '';

    // Total de divergências (TODOS os vínculos únicos - chave de 7 campos)
    const totalDivQuery = `
      SELECT COUNT(DISTINCT ${CHAVE_V}) as total
      FROM censo.recenseados_nova v
      ${recenseamentoJoin}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
    `;

    // Divergências resolvidas - REGRAS ESPECÍFICAS POR TIPO
    
    // INCLUSÃO: Deve EXISTIR no espelho (4 campos batem)
    const resolvidasInclusaoQuery = `
      SELECT COUNT(DISTINCT ${CHAVE_V.replace(/\n/g, ' ')}) as resolvidas
      FROM censo.recenseados_nova v
      ${recenseamentoJoin}
      INNER JOIN censo.espelho_cnes_nova e
        ON e.co_cpf = v.nu_cpf
        AND e.co_cnes = v.co_cnes
        AND e.co_cbo = v.co_cbo_ocupacao::text
        AND e.ind_vinculacao = v.nu_vinculacao
        ${compFilter}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Inclusão'
    `;

    // EXCLUSÃO: NÃO deve existir no espelho (chave de 4 campos NÃO está presente)
    const resolvidasExclusaoQuery = `
      SELECT COUNT(DISTINCT ${CHAVE_V.replace(/\n/g, ' ')}) as resolvidas
      FROM censo.recenseados_nova v
      ${recenseamentoJoin}
      LEFT JOIN censo.espelho_cnes_nova e
        ON e.co_cpf = v.nu_cpf
        AND e.co_cnes = v.co_cnes
        AND e.co_cbo = v.co_cbo_ocupacao::text
        AND e.ind_vinculacao = v.nu_vinculacao
        ${compFilter}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Exclusão'
        AND e.co_cpf IS NULL
    `;

    // ALTERAÇÃO: Existe no espelho MAS com cargas horárias DIFERENTES
    // NOTA: A coluna hospitalar no espelho se chama qt_carga_hor_hosp_sus
    // IMPORTANTE: Usar ::numeric pois as colunas contêm valores decimais (ex: "30.0")
    const resolvidasAlteracaoQuery = `
      SELECT COUNT(DISTINCT ${CHAVE_V.replace(/\n/g, ' ')}) as resolvidas
      FROM censo.recenseados_nova v
      ${recenseamentoJoin}
      INNER JOIN censo.espelho_cnes_nova e
        ON e.co_cpf = v.nu_cpf
        AND e.co_cnes = v.co_cnes
        AND e.co_cbo = v.co_cbo_ocupacao::text
        AND e.ind_vinculacao = v.nu_vinculacao
        ${compFilter}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Alteração'
        AND (
          COALESCE(v.qt_carga_horaria_ambulatorial::numeric, 0) != COALESCE(e.qt_carga_horaria_ambulatorial::numeric, 0) OR
          COALESCE(v.qt_carga_horaria_hospitalar::numeric, 0) != COALESCE(e.qt_carga_hor_hosp_sus::numeric, 0) OR
          COALESCE(v.qt_carga_horaria_outros::numeric, 0) != COALESCE(e.qt_carga_horaria_outros::numeric, 0)
        )
    `;

    // Competências disponíveis (ordenar DESC para pegar a maior primeiro)
    const competenciasQuery = `
      SELECT DISTINCT nu_comp
      FROM censo.espelho_cnes_nova
      ORDER BY nu_comp DESC
    `;

    // Executar sequencialmente para não sobrecarregar o banco remoto com rajada de conexões
    const totalDiv      = params.length > 0 ? await pool.query(totalDivQuery, params)             : await pool.query(totalDivQuery);
    const resolvidasInc = params.length > 0 ? await pool.query(resolvidasInclusaoQuery, params)   : await pool.query(resolvidasInclusaoQuery);
    const resolvidasExc = params.length > 0 ? await pool.query(resolvidasExclusaoQuery, params)   : await pool.query(resolvidasExclusaoQuery);
    const resolvidasAlt = params.length > 0 ? await pool.query(resolvidasAlteracaoQuery, params)  : await pool.query(resolvidasAlteracaoQuery);
    const competencias  = await pool.query(competenciasQuery);

    const total = parseInt(totalDiv.rows[0].total);
    const totalResolvidas = parseInt(resolvidasInc.rows[0].resolvidas || 0) + 
                           parseInt(resolvidasExc.rows[0].resolvidas || 0) + 
                           parseInt(resolvidasAlt.rows[0].resolvidas || 0);
    const pendentes = total - totalResolvidas;
    const taxaResolucao = total > 0 ? ((totalResolvidas / total) * 100).toFixed(1) : 0;

    console.log('📊 Stats calculados:');
    console.log('  Total divergências:', total);
    console.log('  Resolvidas:', totalResolvidas);
    console.log('  Pendentes:', pendentes);
    console.log('  Taxa:', taxaResolucao + '%');

    res.json({
      total_divergencias: total,
      divergencias_resolvidas: totalResolvidas,
      divergencias_pendentes: pendentes,
      taxa_resolucao: parseFloat(taxaResolucao),
      competencias: competencias.rows.map(r => r.nu_comp)
    });

  } catch (err) {
    console.error('Erro em /api/resolucao/stats:', err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas de resolução', details: err.message });
  }
});

/**
 * GET /api/resolucao/agregados
 * Dados agregados para gráficos
 */
app.get('/api/resolucao/agregados', async (req, res) => {
  try {
    const { whereClause, params } = buildResolucaoWhere(req.query);
    const competencia = req.query.comp || req.query.competencia || null; // Aceitar 'comp' ou 'competencia'

    // Verificar se há filtros que exigem JOIN com recenseamento
    const needsRecenseamentoJoin = !!(
      req.query.uf || 
      req.query.macro || 
      req.query.regional || 
      req.query.municipio || 
      req.query.recenseador ||
      req.query.estabelecimento
    );
    
    // JOIN com recenseamento (apenas se necessário)
    const recenseamentoJoin = needsRecenseamentoJoin 
      ? 'INNER JOIN censo.recenseamento_nova r ON v.co_cnes = r.co_cnes' 
      : '';

    const compFilter = competencia ? `AND e.nu_comp::text = '${competencia}'` : '';
    const compJoin = competencia ?
      `INNER JOIN censo.espelho_cnes_nova e ON e.co_cpf = v.nu_cpf AND e.co_cnes = v.co_cnes AND e.co_cbo = v.co_cbo_ocupacao::text AND e.ind_vinculacao = v.nu_vinculacao ${compFilter}` :
      `LEFT JOIN censo.espelho_cnes_nova e ON e.co_cpf = v.nu_cpf AND e.co_cnes = v.co_cnes AND e.co_cbo = v.co_cbo_ocupacao::text AND e.ind_vinculacao = v.nu_vinculacao`;

    console.log('📊 Executando agregados de resolução...');
    console.log('📊 Competência filtrada:', competencia || 'TODAS');

    // Evolução por Competência - SIMPLIFICADA para performance
    // Limitar às competências até a selecionada (evita varrer todo o espelho_cnes_nova)
    const compLimitFilter = competencia ? `AND e.nu_comp <= ${competencia}` : '';

    // CTE reutilizável: espelha EXATAMENTE as 3 queries do /stats
    //   Inclusão resolvida  → INNER JOIN espelho (vínculo existe)
    //   Exclusão resolvida  → LEFT JOIN espelho IS NULL (vínculo ausente)
    //   Alteração resolvida → INNER JOIN espelho com carga diferente
    const resolvidasCTE = `resolvidas_eq AS (
      SELECT DISTINCT ${CHAVE_V} AS chave
      FROM censo.recenseados_nova v ${recenseamentoJoin}
      INNER JOIN censo.espelho_cnes_nova e
        ON e.co_cpf = v.nu_cpf AND e.co_cnes = v.co_cnes
        AND e.co_cbo = v.co_cbo_ocupacao::text AND e.ind_vinculacao = v.nu_vinculacao ${compFilter}
      ${whereClause} ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Inclusão'
      UNION ALL
      SELECT DISTINCT ${CHAVE_V} AS chave
      FROM censo.recenseados_nova v ${recenseamentoJoin}
      LEFT JOIN censo.espelho_cnes_nova e
        ON e.co_cpf = v.nu_cpf AND e.co_cnes = v.co_cnes
        AND e.co_cbo = v.co_cbo_ocupacao::text AND e.ind_vinculacao = v.nu_vinculacao ${compFilter}
      ${whereClause} ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Exclusão'
        AND e.co_cpf IS NULL
      UNION ALL
      SELECT DISTINCT ${CHAVE_V} AS chave
      FROM censo.recenseados_nova v ${recenseamentoJoin}
      INNER JOIN censo.espelho_cnes_nova e
        ON e.co_cpf = v.nu_cpf AND e.co_cnes = v.co_cnes
        AND e.co_cbo = v.co_cbo_ocupacao::text AND e.ind_vinculacao = v.nu_vinculacao ${compFilter}
      ${whereClause} ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Alteração'
        AND (
          COALESCE(v.qt_carga_horaria_ambulatorial::numeric, 0) != COALESCE(e.qt_carga_horaria_ambulatorial::numeric, 0)
          OR COALESCE(v.qt_carga_horaria_hospitalar::numeric, 0) != COALESCE(e.qt_carga_hor_hosp_sus::numeric, 0)
          OR COALESCE(v.qt_carga_horaria_outros::numeric, 0) != COALESCE(e.qt_carga_horaria_outros::numeric, 0)
        )
    )`;

    // Evolução por Competência — equalizada com Indicadores Principais:
    //   Inclusão + Alteração: INNER JOIN espelho → presença confirma resolução
    //   Exclusão: ausência do espelho confirma resolução
    //   Formula por comp C: resolvidas(C) = inc_alt(C) + GREATEST(total_exclusao - excl_presente_em_C, 0)
    const evolucaoQuery = `
      WITH
      total_vinculos AS (
        SELECT COUNT(DISTINCT ${CHAVE_V.replace(/\n/g, ' ')}) AS total
        FROM censo.recenseados_nova v
        ${recenseamentoJoin}
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
      ),
      total_exclusao AS (
        SELECT COUNT(DISTINCT ${CHAVE_V.replace(/\n/g, ' ')}) AS n_exclusao
        FROM censo.recenseados_nova v
        ${recenseamentoJoin}
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Exclusão'
      ),
      competencias_list AS (
        SELECT DISTINCT nu_comp FROM censo.espelho_cnes_nova
        ${competencia ? `WHERE nu_comp <= ${competencia}` : ''}
        ORDER BY nu_comp
      ),
      inc_alt_por_comp AS (
        SELECT e.nu_comp, COUNT(DISTINCT ${RESOLVIDA_CASE_EVOLUCAO}) AS resolvidas
        FROM censo.espelho_cnes_nova e
        INNER JOIN censo.recenseados_nova v
          ON e.co_cpf = v.nu_cpf
          AND e.co_cnes = v.co_cnes
          AND e.co_cbo = v.co_cbo_ocupacao::text
          AND e.ind_vinculacao = v.nu_vinculacao
        ${recenseamentoJoin ? 'INNER JOIN censo.recenseamento_nova r ON v.co_cnes = r.co_cnes' : ''}
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
          ${compLimitFilter}
        GROUP BY e.nu_comp
      ),
      excl_no_espelho_por_comp AS (
        -- Exclusão vinculos que AINDA estão no espelho nesta competência (não resolvidos)
        SELECT e.nu_comp, COUNT(DISTINCT ${CHAVE_V.replace(/\n/g, ' ')}) AS n_presente
        FROM censo.recenseados_nova v
        ${recenseamentoJoin}
        INNER JOIN censo.espelho_cnes_nova e
          ON e.co_cpf = v.nu_cpf
          AND e.co_cnes = v.co_cnes
          AND e.co_cbo = v.co_cbo_ocupacao::text
          AND e.ind_vinculacao = v.nu_vinculacao
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Exclusão'
          ${compLimitFilter}
        GROUP BY e.nu_comp
      )
      SELECT
        cl.nu_comp AS competencia,
        tv.total,
        COALESCE(ia.resolvidas, 0)
          + GREATEST(te.n_exclusao - COALESCE(ep.n_presente, 0), 0) AS resolvidas
      FROM competencias_list cl
      CROSS JOIN total_vinculos tv
      CROSS JOIN total_exclusao te
      LEFT JOIN inc_alt_por_comp ia ON ia.nu_comp = cl.nu_comp
      LEFT JOIN excl_no_espelho_por_comp ep ON ep.nu_comp = cl.nu_comp
      ORDER BY cl.nu_comp
    `;

    // Alias consistente: recenseamento_nova = r (via recenseamentoJoin), resolvidas_eq = rv
    const cnesJoin = recenseamentoJoin || 'INNER JOIN censo.recenseamento_nova r ON v.co_cnes = r.co_cnes';

    // Divergências por Tipo — idêntico ao stats (via CTE)
    const tipoQuery = `
      WITH ${resolvidasCTE}
      SELECT
        v.no_tipo_operacao_censo AS tipo,
        COUNT(DISTINCT ${CHAVE_V}) AS total,
        COUNT(DISTINCT rv.chave) AS resolvidas
      FROM censo.recenseados_nova v
      ${recenseamentoJoin}
      LEFT JOIN resolvidas_eq rv ON rv.chave = ${CHAVE_V}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
      GROUP BY v.no_tipo_operacao_censo
    `;

    // Evolução ACUMULADA — equalizada com Indicadores Principais:
    //   Inc + Alt: primeira competência em que aparecem no espelho com condição atendida
    //   Exclusão: total_exclusao − vinculos Exclusão ainda presentes no espelho em cada comp
    //             (uso de MIN() OVER para garantir monotonicidade caso dados não sejam perfeitos)
    const compLimitClause = competencia ? `WHERE nu_comp <= ${competencia}` : '';
    const evolucaoAcumuladaQuery = `
      WITH
      total_vinculos AS (
        SELECT COUNT(DISTINCT ${CHAVE_V.replace(/\n/g, ' ')}) AS total
        FROM censo.recenseados_nova v
        ${recenseamentoJoin}
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
      ),
      total_exclusao AS (
        SELECT COUNT(DISTINCT ${CHAVE_V.replace(/\n/g, ' ')}) AS n_exclusao
        FROM censo.recenseados_nova v
        ${recenseamentoJoin}
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Exclusão'
      ),
      competencias AS (
        SELECT DISTINCT nu_comp FROM censo.espelho_cnes_nova ${compLimitClause} ORDER BY nu_comp
      ),
      primeira_resolucao AS (
        -- Inc e Alt: primeira competência em que aparecem no espelho com condição atendida
        SELECT
          ${CHAVE_V} AS id,
          MIN(e.nu_comp) AS comp_resolucao
        FROM censo.recenseados_nova v
        ${recenseamentoJoin}
        INNER JOIN censo.espelho_cnes_nova e
          ON e.co_cpf = v.nu_cpf
          AND e.co_cnes = v.co_cnes
          AND e.co_cbo = v.co_cbo_ocupacao::text
          AND e.ind_vinculacao = v.nu_vinculacao
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
          AND (
            v.no_tipo_operacao_censo = 'Inclusão'
            OR (
              v.no_tipo_operacao_censo = 'Alteração' AND (
                COALESCE(v.qt_carga_horaria_ambulatorial::numeric, 0) != COALESCE(e.qt_carga_horaria_ambulatorial::numeric, 0)
                OR COALESCE(v.qt_carga_horaria_hospitalar::numeric, 0) != COALESCE(e.qt_carga_hor_hosp_sus::numeric, 0)
                OR COALESCE(v.qt_carga_horaria_outros::numeric, 0) != COALESCE(e.qt_carga_horaria_outros::numeric, 0)
              )
            )
          )
        GROUP BY ${CHAVE_V}
      ),
      excl_no_espelho_por_comp AS (
        -- Quantidade de vinculos Exclusão ainda presentes no espelho por competência
        SELECT e.nu_comp, COUNT(DISTINCT ${CHAVE_V.replace(/\n/g, ' ')}) AS n_presente
        FROM censo.recenseados_nova v
        ${recenseamentoJoin}
        INNER JOIN censo.espelho_cnes_nova e
          ON e.co_cpf = v.nu_cpf
          AND e.co_cnes = v.co_cnes
          AND e.co_cbo = v.co_cbo_ocupacao::text
          AND e.ind_vinculacao = v.nu_vinculacao
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Exclusão'
        GROUP BY e.nu_comp
      ),
      resolvidas_por_comp AS (
        SELECT
          c.nu_comp,
          tv.total,
          te.n_exclusao,
          COUNT(DISTINCT pr.id) AS resolvidas_inc_alt,
          COALESCE(ep.n_presente, 0) AS excl_presente
        FROM competencias c
        CROSS JOIN total_vinculos tv
        CROSS JOIN total_exclusao te
        LEFT JOIN primeira_resolucao pr ON pr.comp_resolucao = c.nu_comp
        LEFT JOIN excl_no_espelho_por_comp ep ON ep.nu_comp = c.nu_comp
        GROUP BY c.nu_comp, tv.total, te.n_exclusao, ep.n_presente
      )
      -- Soma acumulada Inc+Alt via window; Exclusão = total menos o mínimo ainda-presente
      -- até a competência atual (MIN garante monotonicidade mesmo com dados irregulares)
      SELECT
        nu_comp AS competencia,
        total,
        SUM(resolvidas_inc_alt) OVER (ORDER BY nu_comp)
          + GREATEST(
              n_exclusao - MIN(excl_presente) OVER (ORDER BY nu_comp ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
              0
            ) AS resolvidas_acumuladas
      FROM resolvidas_por_comp
      ORDER BY nu_comp
    `;

    // Top 10 Ocupações com Divergências — idêntico ao stats (via CTE)
    const cboQuery = `
      WITH ${resolvidasCTE}
      SELECT
        v.ds_cbo_ocupacao AS cbo,
        COUNT(DISTINCT ${CHAVE_V}) AS total,
        COUNT(DISTINCT rv.chave) AS resolvidas
      FROM censo.recenseados_nova v
      ${recenseamentoJoin}
      LEFT JOIN resolvidas_eq rv ON rv.chave = ${CHAVE_V}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
        AND v.ds_cbo_ocupacao IS NOT NULL AND v.ds_cbo_ocupacao != ''
      GROUP BY v.ds_cbo_ocupacao
      ORDER BY total DESC
      LIMIT 10
    `;

    // Top 10 Estabelecimentos com Divergências — idêntico ao stats (via CTE)
    const cnesQuery = `
      WITH ${resolvidasCTE}
      SELECT
        r.no_razao_social AS estabelecimento,
        v.co_cnes,
        COUNT(DISTINCT ${CHAVE_V}) AS total,
        COUNT(DISTINCT rv.chave) AS resolvidas
      FROM censo.recenseados_nova v
      ${cnesJoin}
      LEFT JOIN resolvidas_eq rv ON rv.chave = ${CHAVE_V}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
        AND r.no_razao_social IS NOT NULL
      GROUP BY r.no_razao_social, v.co_cnes
      ORDER BY total DESC
      LIMIT 10
    `;

    // Top 10 Ocupações com MENOR taxa de resolução — idêntico ao stats (via CTE)
    const cboPendentesQuery = `
      WITH ${resolvidasCTE}
      SELECT
        v.ds_cbo_ocupacao AS cbo,
        COUNT(DISTINCT ${CHAVE_V}) AS total,
        COUNT(DISTINCT rv.chave) AS resolvidas,
        COUNT(DISTINCT ${CHAVE_V}) - COUNT(DISTINCT rv.chave) AS pendentes,
        CASE
          WHEN COUNT(DISTINCT ${CHAVE_V}) > 0
          THEN ROUND(COUNT(DISTINCT rv.chave)::numeric / COUNT(DISTINCT ${CHAVE_V})::numeric * 100, 1)
          ELSE 0
        END AS taxa_resolucao
      FROM censo.recenseados_nova v
      ${recenseamentoJoin}
      LEFT JOIN resolvidas_eq rv ON rv.chave = ${CHAVE_V}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
        AND v.ds_cbo_ocupacao IS NOT NULL AND v.ds_cbo_ocupacao != ''
      GROUP BY v.ds_cbo_ocupacao
      HAVING COUNT(DISTINCT ${CHAVE_V}) >= 5
      ORDER BY taxa_resolucao ASC, total DESC
      LIMIT 10
    `;

    // Top 10 Estabelecimentos com MENOR taxa de resolução — idêntico ao stats (via CTE)
    const cnesPendentesQuery = `
      WITH ${resolvidasCTE}
      SELECT
        r.no_razao_social AS estabelecimento,
        v.co_cnes,
        COUNT(DISTINCT ${CHAVE_V}) AS total,
        COUNT(DISTINCT rv.chave) AS resolvidas,
        COUNT(DISTINCT ${CHAVE_V}) - COUNT(DISTINCT rv.chave) AS pendentes,
        CASE
          WHEN COUNT(DISTINCT ${CHAVE_V}) > 0
          THEN ROUND(COUNT(DISTINCT rv.chave)::numeric / COUNT(DISTINCT ${CHAVE_V})::numeric * 100, 1)
          ELSE 0
        END AS taxa_resolucao
      FROM censo.recenseados_nova v
      ${cnesJoin}
      LEFT JOIN resolvidas_eq rv ON rv.chave = ${CHAVE_V}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
        AND r.no_razao_social IS NOT NULL
      GROUP BY r.no_razao_social, v.co_cnes
      HAVING COUNT(DISTINCT ${CHAVE_V}) >= 5
      ORDER BY taxa_resolucao ASC, total DESC
      LIMIT 10
    `;

    // Helper: executa uma query com timeout isolado via client dedicado.
    // Se exceder o limite ou der erro, retorna { rows: [] } sem derrubar o endpoint.
    const queryComTimeout = async (sql, queryParams, timeoutMs = 45000) => {
      const client = await pool.connect();
      try {
        await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
        return queryParams && queryParams.length > 0
          ? await client.query(sql, queryParams)
          : await client.query(sql);
      } finally {
        client.release();
      }
    };

    // Queries de evolução dependem de JOIN espelho_cnes↔vinculos sem índice:
    // isoladas com timeout de 45s — retornam vazio se o banco não responder a tempo.
    // Timeout reduzido para 20s: falha rápido e libera a conexão para as demais queries
    let evolucao = { rows: [] };
    try {
      evolucao = await queryComTimeout(evolucaoQuery, params, 120000);
    } catch (err) {
      console.warn('⚠️ evolucao ignorada (timeout/erro):', err.message);
    }

    // Tipo não depende de varredura do espelho por período — geralmente rápida
    const tipo = params.length > 0 ? await pool.query(tipoQuery, params) : await pool.query(tipoQuery);

    let evolucaoAcumulada = { rows: [] };
    try {
      evolucaoAcumulada = await queryComTimeout(evolucaoAcumuladaQuery, params, 120000);
    } catch (err) {
      console.warn('⚠️ evolucaoAcumulada ignorada (timeout/erro):', err.message);
    }

    const cbo          = params.length > 0 ? await pool.query(cboQuery, params)           : await pool.query(cboQuery);
    const cnes         = params.length > 0 ? await pool.query(cnesQuery, params)          : await pool.query(cnesQuery);
    const cboPendentes = params.length > 0 ? await pool.query(cboPendentesQuery, params)  : await pool.query(cboPendentesQuery);
    const cnesPendentes= params.length > 0 ? await pool.query(cnesPendentesQuery, params) : await pool.query(cnesPendentesQuery);

    // Total de vínculos no CNES por competência (sempre sem filtro — reflete base CNES completa)
    const espelhoPorComp = await pool.query(`
      SELECT nu_comp, COUNT(*) AS total_cnes
      FROM censo.espelho_cnes_nova
      GROUP BY nu_comp
      ORDER BY nu_comp
    `);

    console.log('✅ Agregados de resolução concluídos');
    console.log('📊 Evolução:', evolucao.rows.length, 'competências');
    if (evolucao.rows.length > 0) {
      console.log('  Exemplo:', evolucao.rows[0]);
    }
    console.log('📊 Evolução Acumulada:', evolucaoAcumulada.rows.length, 'competências');
    console.log('📊 Por tipo:', tipo.rows.length, 'tipos');
    if (tipo.rows.length > 0) {
      const totalPorTipo = tipo.rows.reduce((sum, r) => sum + parseInt(r.total), 0);
      console.log('  Total somado por tipo:', totalPorTipo);
    }
    console.log('📊 CBOs:', cbo.rows.length);
    console.log('📊 Estabelecimentos:', cnes.rows.length);
    console.log('📊 CBOs Pendentes:', cboPendentes.rows.length);
    console.log('📊 Estabelecimentos Pendentes:', cnesPendentes.rows.length);

    res.json({
      evolucao: evolucao.rows,
      evolucao_acumulada: evolucaoAcumulada.rows,
      tipo: tipo.rows,
      cbo: cbo.rows,
      estabelecimentos: cnes.rows,
      cbo_pendentes: cboPendentes.rows,
      estabelecimentos_pendentes: cnesPendentes.rows,
      espelho_por_comp: espelhoPorComp.rows
    });

  } catch (err) {
    console.error('Erro em /api/resolucao/agregados:', err);
    res.status(500).json({ error: 'Erro ao buscar dados agregados', details: err.message });
  }
});

/**
 * GET /api/resolucao/filtros
 * Opções para filtros dinâmicos
 */
app.get('/api/resolucao/filtros', async (req, res) => {
  try {
    const [competencias, operacoes, cbo, estabelecimentos, uf, macro, regional, municipio, recenseador] = await Promise.all([
      // Competências
      pool.query(`
        SELECT DISTINCT
          nu_comp::text as codigo,
          nu_comp::text as descricao,
          nu_comp::text || ' - ' ||
          CASE SUBSTRING(nu_comp::text, 5, 2)
            WHEN '01' THEN 'Jan'
            WHEN '02' THEN 'Fev'
            WHEN '03' THEN 'Mar'
            WHEN '04' THEN 'Abr'
            WHEN '05' THEN 'Mai'
            WHEN '06' THEN 'Jun'
            WHEN '07' THEN 'Jul'
            WHEN '08' THEN 'Ago'
            WHEN '09' THEN 'Set'
            WHEN '10' THEN 'Out'
            WHEN '11' THEN 'Nov'
            WHEN '12' THEN 'Dez'
          END || '/' || SUBSTRING(nu_comp::text, 1, 4) as valor
        FROM censo.espelho_cnes_nova
        ORDER BY nu_comp DESC
      `),
      
      // Tipos de Operação
      pool.query(`
        SELECT DISTINCT no_tipo_operacao_censo as valor
        FROM censo.recenseados_nova
        WHERE no_tipo_operacao_censo IS NOT NULL
        ORDER BY no_tipo_operacao_censo
      `),
      
      // CBO (código + descrição)
      pool.query(`
        SELECT DISTINCT
          co_cbo_ocupacao as codigo,
          ds_cbo_ocupacao as descricao,
          co_cbo_ocupacao::text || ' - ' || ds_cbo_ocupacao as valor
        FROM censo.recenseados_nova
        WHERE st_cnes = 'N'
          AND co_cbo_ocupacao IS NOT NULL
          AND ds_cbo_ocupacao IS NOT NULL
          AND ds_cbo_ocupacao != ''
        ORDER BY ds_cbo_ocupacao
      `),
      
      // Estabelecimentos (CNES + razão social)
      pool.query(`
        SELECT DISTINCT 
          v.co_cnes as codigo,
          r.no_razao_social as descricao,
          v.co_cnes || ' - ' || r.no_razao_social as valor
        FROM censo.recenseados_nova v
        LEFT JOIN censo.recenseamento_nova r ON v.co_cnes = r.co_cnes
        WHERE 1=1
          AND r.no_razao_social IS NOT NULL
        ORDER BY r.no_razao_social
      `),
      
      // UF
      pool.query(`
        SELECT DISTINCT sg_uf as valor
        FROM censo.recenseamento_nova
        WHERE sg_uf IS NOT NULL
        ORDER BY sg_uf
      `),
      
      // Macrorregião
      pool.query(`
        SELECT DISTINCT 
          no_macrorregional as codigo,
          no_macrorregional as descricao,
          no_macrorregional as valor
        FROM censo.recenseamento_nova
        WHERE no_macrorregional IS NOT NULL
        ORDER BY no_macrorregional
      `),
      
      // Região de Saúde
      pool.query(`
        SELECT DISTINCT 
          no_regional_saude as codigo,
          no_regional_saude as descricao,
          no_regional_saude as valor
        FROM censo.recenseamento_nova
        WHERE no_regional_saude IS NOT NULL
        ORDER BY no_regional_saude
      `),
      
      // Município
      pool.query(`
        SELECT DISTINCT 
          no_municipio as codigo,
          no_municipio as descricao,
          no_municipio as valor
        FROM censo.recenseamento_nova
        WHERE no_municipio IS NOT NULL
        ORDER BY no_municipio
      `),
      
      // Recenseador
      pool.query(`
        SELECT DISTINCT recenseador as valor
        FROM censo.recenseamento_nova
        WHERE recenseador IS NOT NULL AND recenseador != ''
        ORDER BY recenseador
      `)
    ]);

    res.json({
      competencias: competencias.rows,
      operacoes: operacoes.rows.map(r => r.valor),
      cbo: cbo.rows,
      estabelecimentos: estabelecimentos.rows,
      uf: uf.rows.map(r => r.valor),
      macro: macro.rows,
      regional: regional.rows,
      municipio: municipio.rows,
      recenseador: recenseador.rows.map(r => r.valor)
    });

  } catch (err) {
    console.error('Erro em /api/resolucao/filtros:', err);
    res.status(500).json({ error: 'Erro ao buscar filtros', details: err.message });
  }
});

/**
 * GET /api/resolucao/tabela
 * Registros paginados para a tabela
 */
app.get('/api/resolucao/tabela', async (req, res) => {
  try {
    let { whereClause, params } = buildResolucaoWhere(req.query);
    const competencia = req.query.comp || req.query.competencia || null;
    const busca = req.query.busca;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    // Busca textual (CPF, CNES, CBO)
    if (busca && busca.trim()) {
      const buscaParam = `%${busca.trim()}%`;
      const buscaCond = `(v.nu_cpf ILIKE $${params.length + 1} OR v.co_cnes::text ILIKE $${params.length + 1} OR v.ds_cbo_ocupacao ILIKE $${params.length + 1})`;
      whereClause = whereClause ? whereClause + ` AND ${buscaCond}` : `WHERE ${buscaCond}`;
      params.push(buscaParam);
    }

    const compFilter = competencia ? `AND e.nu_comp = '${competencia}'` : '';

    console.log('📋 Tabela Resolução - Competência:', competencia || 'TODAS');
    console.log('📋 Tabela Resolução - WHERE:', whereClause);
    console.log('📋 Tabela Resolução - Params:', params);

    // Query de dados
    const dataQuery = `
      SELECT 
        v.nu_cpf,
        v.co_cnes,
        r.no_razao_social,
        v.ds_cbo_ocupacao,
        v.nu_vinculacao,
        v.vinculacao,
        v.no_tipo_operacao_censo,
        r.sg_uf,
        r.no_municipio,
        CASE 
          WHEN e.co_cpf IS NOT NULL THEN 'Resolvida'
          ELSE 'Pendente'
        END as status
      FROM censo.recenseados_nova v
      LEFT JOIN censo.recenseamento_nova r ON v.co_cnes = r.co_cnes
      LEFT JOIN censo.espelho_cnes_nova e
        ON e.co_cpf = v.nu_cpf
        AND e.co_cnes = v.co_cnes
        AND e.co_cbo = v.co_cbo_ocupacao::text
        AND e.ind_vinculacao = v.nu_vinculacao
        ${compFilter}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
      ORDER BY v.nu_cpf, v.co_cnes
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Query de contagem total
    const countQuery = `
      SELECT COUNT(DISTINCT v.nu_cpf || '|' || v.co_cnes || '|' || v.co_cbo_ocupacao::text || '|' || v.nu_vinculacao || '|' || COALESCE(v.qt_carga_horaria_ambulatorial::text, '') || '|' || COALESCE(v.qt_carga_horaria_hospitalar::text, '') || '|' || COALESCE(v.qt_carga_horaria_outros::text, '')) as total
      FROM censo.recenseados_nova v
      LEFT JOIN censo.recenseamento_nova r ON v.co_cnes = r.co_cnes
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
    `;

    const [data, count] = await Promise.all([
      params.length > 0 ? pool.query(dataQuery, params) : pool.query(dataQuery),
      params.length > 0 ? pool.query(countQuery, params) : pool.query(countQuery)
    ]);

    console.log(`✅ Tabela carregada: ${data.rows.length} registros (total: ${count.rows[0].total})`);

    res.json({
      data: data.rows,
      total: parseInt(count.rows[0].total),
      page,
      limit,
      totalPages: Math.ceil(parseInt(count.rows[0].total) / limit)
    });

  } catch (err) {
    console.error('Erro em /api/resolucao/tabela:', err);
    res.status(500).json({ error: 'Erro ao buscar tabela', details: err.message });
  }
});

// ========================================
// ROTAS DE SISTEMA
// ========================================

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: err.message 
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'FioCruz API - Painéis de Monitoramento',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      estabelecimentos: {
        '/api/estabelecimentos/stats': 'Estatísticas gerais',
        '/api/estabelecimentos/por-situacao': 'Agrupamento por situação',
        '/api/estabelecimentos/por-uf': 'Agrupamento por UF'
      },
      vinculos: {
        '/api/vinculos/stats': 'Estatísticas gerais',
        '/api/vinculos/agregados': 'Dados agregados para gráficos',
        '/api/vinculos/tabela': 'Tabela paginada com filtros',
        '/api/vinculos/filtros': 'Valores para popular filtros'
      },
      resolucao: {
        '/api/resolucao/dados': 'Dados de resolução por competência'
      },
      system: {
        '/health': 'Health check',
        '/': 'Esta documentação'
      }
    }
  });
});

/**
 * GET /api/admin/stats
 * Métricas de uso da API (contadores em memória — resetam ao reiniciar)
 */
app.get('/api/admin/stats', (req, res) => {
  const uptimeSec = Math.floor(process.uptime());
  const uptimeStr = `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`;

  // Enriquecer endpoints com avg_ms e taxa de erro
  const endpoints = {};
  for (const [path, ep] of Object.entries(API_STATS.endpoints)) {
    endpoints[path] = {
      calls: ep.calls,
      errors: ep.errors,
      error_rate: ep.calls > 0 ? ((ep.errors / ep.calls) * 100).toFixed(1) + '%' : '0%',
      avg_ms: ep.calls > 0 ? Math.round(ep.totalMs / ep.calls) : 0,
      last_called_at: ep.lastCalledAt
    };
  }

  // Ordenar por número de chamadas (mais usado primeiro)
  const endpointsSorted = Object.fromEntries(
    Object.entries(endpoints).sort(([, a], [, b]) => b.calls - a.calls)
  );

  res.json({
    server: {
      started_at: API_STATS.startedAt,
      uptime: uptimeStr,
      node_version: process.version,
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    },
    requests: {
      total: API_STATS.totalRequests,
      errors: API_STATS.totalErrors,
      error_rate: API_STATS.totalRequests > 0
        ? ((API_STATS.totalErrors / API_STATS.totalRequests) * 100).toFixed(1) + '%'
        : '0%'
    },
    pool: {
      total_connections: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    },
    endpoints: endpointsSorted
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 API disponível em: http://localhost:${PORT}`);
  console.log(`💚 Health check: http://localhost:${PORT}/health\n`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM recebido, encerrando...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT recebido, encerrando...');
  await pool.end();
  process.exit(0);
});
