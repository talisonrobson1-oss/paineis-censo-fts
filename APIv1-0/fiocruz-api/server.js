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
      const [rawCnes, regSaude, regAdm] = cols.map(c => c.trim());
      if (!rawCnes) continue;
      const cnes = rawCnes.padStart(7, '0'); // normaliza para 7 dígitos (padrão do banco)
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
  query_timeout: 600000, // 10 min — suporta exportação completa da tabela de vínculos
  statement_timeout: 600000, // 10 min
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
 * Helper: normalizar parâmetro de query como array de strings não-vazias.
 * Aceita string simples, array de strings, ou valor falsy → retorna array.
 */
function normalizeArr(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return [val];
}

/**
 * Helper: adicionar condição de igualdade (simples ou ANY para arrays).
 */
function addEqFilter(conditions, params, paramCount, column, val) {
  const vals = normalizeArr(val);
  if (vals.length === 0) return paramCount;
  if (vals.length === 1) {
    conditions.push(`${column} = $${paramCount}`);
    params.push(vals[0]);
  } else {
    conditions.push(`${column} = ANY($${paramCount})`);
    params.push(vals);
  }
  return paramCount + 1;
}

/**
 * Helper: Construir WHERE clause a partir de filtros (suporta multi-seleção)
 */
function buildEstabelecimentosWhere(query, additionalConditions = []) {
  const conditions = [...additionalConditions];
  const params = [];
  let p = 1;

  p = addEqFilter(conditions, params, p, 'sg_uf',                    query.uf);
  p = addEqFilter(conditions, params, p, 'no_macrorregional',         query.macrorregiao);
  p = addEqFilter(conditions, params, p, 'no_regional_saude',         query.regional);
  p = addEqFilter(conditions, params, p, 'no_municipio',              query.municipio);
  p = addEqFilter(conditions, params, p, 'situacao_recenseamento',    query.situacao);
  p = addEqFilter(conditions, params, p, 'recenseador',               query.recenseador);
  p = addEqFilter(conditions, params, p, 'estrategia',                query.estrategia);
  p = addEqFilter(conditions, params, p, 'vinculado_sus',             query.sus);
  p = addEqFilter(conditions, params, p, 'esfera',                    query.esfera);
  p = addEqFilter(conditions, params, p, 'tp_unidade',                query.tp_unidade);

  // Filtros de Regionalização DF — agrega CNES de todas as regiões selecionadas
  const regioesDF = normalizeArr(query.regiao_saude_df);
  if (regioesDF.length > 0) {
    const allCnes = [];
    regioesDF.forEach(r => allCnes.push(...(dfRegionSaudeMap[r] || [])));
    const uniqueCnes = [...new Set(allCnes)];
    if (uniqueCnes.length > 0) {
      conditions.push(`co_cnes::text = ANY($${p++})`);
      params.push(uniqueCnes);
    }
  }
  const regioesAdmDF = normalizeArr(query.regiao_adm_df);
  if (regioesAdmDF.length > 0) {
    const allCnes = [];
    regioesAdmDF.forEach(r => allCnes.push(...(dfRegionAdmMap[r] || [])));
    const uniqueCnes = [...new Set(allCnes)];
    if (uniqueCnes.length > 0) {
      conditions.push(`co_cnes::text = ANY($${p++})`);
      params.push(uniqueCnes);
    }
  }

  // Excluir CNES já classificados nas regiões DF (Padrão CNES "Distrito Federal" → apenas os ~824 sem classificação)
  if (query.excluir_classificacao_df === '1') {
    const allClassifiedCnes = [];
    Object.values(dfRegionSaudeMap).forEach(arr => allClassifiedCnes.push(...arr));
    const uniqueCnes = [...new Set(allClassifiedCnes)];
    if (uniqueCnes.length > 0) {
      conditions.push(`co_cnes::text != ALL($${p++})`);
      params.push(uniqueCnes);
    }
  }

  return {
    whereClause: conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '',
    params,
    paramCount: p
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
        no_macrorregional,
        no_regional_saude,
        no_municipio,
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
app.get('/api/estabelecimentos/filtros-df', async (req, res) => {
  try {
    const classifiedCnes = [...new Set(Object.values(dfRegionSaudeMap).flat())];
    let nao_classificados_df = 0;
    if (classifiedCnes.length > 0) {
      const r = await pool.query(
        `SELECT COUNT(DISTINCT co_cnes) AS n FROM censo.recenseamento_nova WHERE sg_uf = 'DF' AND co_cnes::text != ALL($1)`,
        [classifiedCnes]
      );
      nao_classificados_df = parseInt(r.rows[0].n) || 0;
    } else {
      const r = await pool.query(
        `SELECT COUNT(DISTINCT co_cnes) AS n FROM censo.recenseamento_nova WHERE sg_uf = 'DF'`
      );
      nao_classificados_df = parseInt(r.rows[0].n) || 0;
    }
    res.json({
      regioes_saude_df:    Object.keys(dfRegionSaudeMap).sort(),
      regioes_adm_df:      Object.keys(dfRegionAdmMap).sort(),
      nao_classificados_df
    });
  } catch (err) {
    res.json({
      regioes_saude_df:    Object.keys(dfRegionSaudeMap).sort(),
      regioes_adm_df:      Object.keys(dfRegionAdmMap).sort(),
      nao_classificados_df: -1
    });
  }
});

// ========================================
// ROTAS - PAINEL DE VÍNCULOS
// ========================================

/**
 * Helper: Construir WHERE clause para vínculos
 */
function buildVinculosWhere(query, additionalConditions = [], startParamCount = 1) {
  const conditions = [...additionalConditions];
  const params = [];
  let paramCount = startParamCount;

  console.log('🔍 buildVinculosWhere recebeu:', query);

  // ---- Localização (subquery em recenseamento_nova) — suporta multi-seleção ----
  const addSubqueryFilter = (col, val) => {
    const vals = normalizeArr(val);
    if (vals.length === 0) return;
    if (vals.length === 1) {
      conditions.push(`co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE ${col} = $${paramCount++})`);
      params.push(vals[0]);
    } else {
      conditions.push(`co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE ${col} = ANY($${paramCount++}))`);
      params.push(vals);
    }
  };

  addSubqueryFilter('sg_uf',            query.uf);
  addSubqueryFilter('no_macrorregional', query.macro);
  addSubqueryFilter('no_regional_saude', query.regional);
  addSubqueryFilter('no_municipio',      query.municipio);

  // Regiões DF — agrega CNES de todas as regiões selecionadas
  const regioesDF = normalizeArr(query.regiao_saude_df);
  if (regioesDF.length > 0) {
    const allCnes = [];
    regioesDF.forEach(r => allCnes.push(...(dfRegionSaudeMap[r] || []).map(String)));
    const uniqueCnes = [...new Set(allCnes)];
    if (uniqueCnes.length > 0) {
      conditions.push(`co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE co_cnes::text = ANY($${paramCount++}))`);
      params.push(uniqueCnes);
      console.log('  ✓ Filtro Região de Saúde DF aplicado:', regioesDF);
    }
  }
  const regioesAdmDF = normalizeArr(query.regiao_adm_df);
  if (regioesAdmDF.length > 0) {
    const allCnes = [];
    regioesAdmDF.forEach(r => allCnes.push(...(dfRegionAdmMap[r] || []).map(String)));
    const uniqueCnes = [...new Set(allCnes)];
    if (uniqueCnes.length > 0) {
      conditions.push(`co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE co_cnes::text = ANY($${paramCount++}))`);
      params.push(uniqueCnes);
      console.log('  ✓ Filtro Região Administrativa DF aplicado:', regioesAdmDF);
    }
  }
  
  // CBO: suporte a múltiplas seleções
  const cboVals = normalizeArr(query.cbo);
  if (cboVals.length > 0) {
    if (cboVals.length === 1) {
      conditions.push(`(co_cbo_ocupacao::text = $${paramCount} OR ds_cbo_ocupacao = $${paramCount})`);
      params.push(cboVals[0]);
      paramCount++;
    } else {
      conditions.push(`(co_cbo_ocupacao::text = ANY($${paramCount}) OR ds_cbo_ocupacao = ANY($${paramCount}))`);
      params.push(cboVals);
      paramCount++;
    }
    console.log('  ✓ Filtro CBO aplicado:', cboVals);
  }

  // Vínculo
  const vinculoVals = normalizeArr(query.vinculo);
  if (vinculoVals.length > 0) {
    if (vinculoVals.length === 1) {
      conditions.push(`(nu_vinculacao = $${paramCount} OR vinculacao = $${paramCount})`);
      params.push(vinculoVals[0]);
      paramCount++;
    } else {
      conditions.push(`(nu_vinculacao = ANY($${paramCount}) OR vinculacao = ANY($${paramCount}))`);
      params.push(vinculoVals);
      paramCount++;
    }
    console.log('  ✓ Filtro Vínculo aplicado:', vinculoVals);
  }

  // Estabelecimento
  const estabVals = normalizeArr(query.estabelecimento);
  if (estabVals.length > 0) {
    if (estabVals.length === 1) {
      conditions.push(`co_cnes = $${paramCount++}`);
      params.push(estabVals[0]);
    } else {
      conditions.push(`co_cnes = ANY($${paramCount++})`);
      params.push(estabVals);
    }
    console.log('  ✓ Filtro Estabelecimento aplicado:', estabVals);
  }

  // Sexo: M/1 = Masculino, F/2 = Feminino — suporta múltiplos
  const sexoVals = normalizeArr(query.sexo);
  if (sexoVals.length > 0) {
    const masc = sexoVals.some(v => v === 'M' || v === 'Masculino');
    const fem  = sexoVals.some(v => v === 'F' || v === 'Feminino');
    if (masc && fem) { /* ambos = sem filtro */ }
    else if (masc) conditions.push(`co_sexo IN ('M', '1')`);
    else if (fem)  conditions.push(`co_sexo IN ('F', '2')`);
    console.log('  ✓ Filtro Sexo aplicado:', sexoVals);
  }

  // Escolaridade
  const escVals = normalizeArr(query.escolaridade);
  if (escVals.length > 0) {
    if (escVals.length === 1) {
      conditions.push(`(co_escolaridade::text = $${paramCount} OR ds_escolaridade = $${paramCount})`);
      params.push(escVals[0]);
      paramCount++;
    } else {
      conditions.push(`(co_escolaridade::text = ANY($${paramCount}) OR ds_escolaridade = ANY($${paramCount}))`);
      params.push(escVals);
      paramCount++;
    }
    console.log('  ✓ Filtro Escolaridade aplicado:', escVals);
  }

  // Raça/Cor
  const racaVals = normalizeArr(query.raca);
  if (racaVals.length > 0) {
    const semInfo = racaVals.includes('Sem informação');
    const outros  = racaVals.filter(v => v !== 'Sem informação');
    if (semInfo && outros.length === 0) {
      conditions.push(`(ds_raca_cor IS NULL OR ds_raca_cor = '' OR UPPER(ds_raca_cor) = 'SEM INFORMACAO')`);
    } else if (!semInfo && outros.length > 0) {
      if (outros.length === 1) { conditions.push(`ds_raca_cor = $${paramCount++}`); params.push(outros[0]); }
      else                     { conditions.push(`ds_raca_cor = ANY($${paramCount++})`); params.push(outros); }
    } else if (semInfo && outros.length > 0) {
      // semInfo OU outros
      if (outros.length === 1) { conditions.push(`(ds_raca_cor IS NULL OR ds_raca_cor = '' OR UPPER(ds_raca_cor) = 'SEM INFORMACAO' OR ds_raca_cor = $${paramCount++})`); params.push(outros[0]); }
      else                     { conditions.push(`(ds_raca_cor IS NULL OR ds_raca_cor = '' OR UPPER(ds_raca_cor) = 'SEM INFORMACAO' OR ds_raca_cor = ANY($${paramCount++}))`); params.push(outros); }
    }
    console.log('  ✓ Filtro Raça aplicado:', racaVals);
  }

  // CINE
  const cineVals = normalizeArr(query.cine);
  if (cineVals.length > 0) {
    if (cineVals.length === 1) {
      conditions.push(`(co_cine = $${paramCount} OR ds_cine = $${paramCount})`);
      params.push(cineVals[0]);
      paramCount++;
    } else {
      conditions.push(`(co_cine = ANY($${paramCount}) OR ds_cine = ANY($${paramCount}))`);
      params.push(cineVals);
      paramCount++;
    }
    console.log('  ✓ Filtro CINE aplicado:', cineVals);
  }

  // Tipo de Operação
  const opVals = normalizeArr(query.operacao);
  if (opVals.length > 0) {
    if (opVals.length === 1) { conditions.push(`no_tipo_operacao_censo = $${paramCount++}`); params.push(opVals[0]); }
    else                     { conditions.push(`no_tipo_operacao_censo = ANY($${paramCount++})`); params.push(opVals); }
    console.log('  ✓ Filtro Operação aplicado:', opVals);
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
    
    console.log('📊 Executando todos os agregados em paralelo...');
    // Todas as queries em paralelo (única rodada)
    const [operacao, operacaoCnes, sexo, raca,
      identidadeGenero, escolaridade, cine, cbo,
      vinculacao, cargaHoraria, expectativa, estrategia
    ] = await Promise.all([
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
      
      // Sexo (unificado: M/1=Masculino, F/2=Feminino, resto=Inválido) — CPFs únicos
      executeQuery(`
        SELECT
          CASE
            WHEN co_sexo IN ('M', '1') THEN 'Masculino'
            WHEN co_sexo IN ('F', '2') THEN 'Feminino'
            ELSE 'Inválido/Não informado'
          END as sexo,
          COUNT(DISTINCT nu_cpf) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + " AND co_sexo IS NOT NULL AND co_sexo != ''" : "WHERE co_sexo IS NOT NULL AND co_sexo != ''"}
        GROUP BY
          CASE
            WHEN co_sexo IN ('M', '1') THEN 'Masculino'
            WHEN co_sexo IN ('F', '2') THEN 'Feminino'
            ELSE 'Inválido/Não informado'
          END
      `),
      
      // Raça/Cor — CPFs únicos
      executeQuery(`
        SELECT
          CASE
            WHEN ds_raca_cor IS NULL OR ds_raca_cor = '' OR UPPER(ds_raca_cor) = 'SEM INFORMAÇÃO'
            THEN 'Sem informação'
            ELSE ds_raca_cor
          END as raca,
          COUNT(DISTINCT nu_cpf) as n
        FROM censo.recenseados_nova
        ${whereClause}
        GROUP BY
          CASE
            WHEN ds_raca_cor IS NULL OR ds_raca_cor = '' OR UPPER(ds_raca_cor) = 'SEM INFORMAÇÃO'
            THEN 'Sem informação'
            ELSE ds_raca_cor
          END
      `),

      // Identidade de Gênero — CPFs únicos
      executeQuery(`
        SELECT ds_identidade_genero as identidade, COUNT(DISTINCT nu_cpf) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + " AND ds_identidade_genero IS NOT NULL AND ds_identidade_genero != ''" : "WHERE ds_identidade_genero IS NOT NULL AND ds_identidade_genero != ''"}
        GROUP BY ds_identidade_genero
      `),
      
      // Escolaridade — CPFs únicos
      executeQuery(`
        SELECT ds_escolaridade as escolaridade, COUNT(DISTINCT nu_cpf) as n
        FROM censo.recenseados_nova
        ${whereClause ? whereClause + " AND ds_escolaridade IS NOT NULL AND ds_escolaridade != ''" : "WHERE ds_escolaridade IS NOT NULL AND ds_escolaridade != ''"}
        GROUP BY ds_escolaridade
      `),
      
      // Área de Formação (CINE) - Top 15 — CPFs únicos
      executeQuery(`
        SELECT ds_cine as cine, COUNT(DISTINCT nu_cpf) as n
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
      `),

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
      
      // Expectativa Profissional — CPFs únicos
      executeQuery(`
        SELECT no_expectativa_profissional as expectativa, COUNT(DISTINCT nu_cpf) as n
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

    console.log('✅ Todos os agregados concluídos em paralelo');

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
 * Retorna registros paginados de recenseados_nova + vínculos não alterados (espelho_cnes_nova).
 * "Não alterados" = registros do espelho (min competência) sem correspondência em recenseados_nova.
 * Filtros de localização/CBO/vínculo/estabelecimento aplicados ao espelho;
 * demais filtros (sexo, raca, esc, cine, operacao) aplicados apenas ao recenseados.
 * Quando operacao não inclui "Não alterado", o espelho é omitido da query (sem custo de NOT EXISTS).
 */
app.get('/api/vinculos/tabela', async (req, res) => {
  try {
    const { page = 1, limit = 30, busca } = req.query;
    const offset = (page - 1) * limit;

    const allParams = [];
    let paramCount  = 1;

    // ── 0. Determinar includeEspelho ANTES de construir params (evita $N sem referência na query) ──
    const opValsCheck  = normalizeArr(req.query.operacao);
    const includeEspelho = opValsCheck.length === 0 || opValsCheck.some(v => v === 'Não alterado');

    // ── 1. Condições do espelho_cnes_nova (SOMENTE se incluir espelho) ──
    const espelhoConditions = [];
    if (includeEspelho) {
      const addEspelhoSubq = (col, val) => {
        const vals = normalizeArr(val);
        if (!vals.length) return;
        if (vals.length === 1) {
          espelhoConditions.push(`e.co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE ${col} = $${paramCount++})`);
          allParams.push(vals[0]);
        } else {
          espelhoConditions.push(`e.co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE ${col} = ANY($${paramCount++}))`);
          allParams.push(vals);
        }
      };
      addEspelhoSubq('sg_uf',             req.query.uf);
      addEspelhoSubq('no_macrorregional',  req.query.macro);
      addEspelhoSubq('no_regional_saude',  req.query.regional);
      addEspelhoSubq('no_municipio',       req.query.municipio);

      const regioesDF_t = normalizeArr(req.query.regiao_saude_df);
      if (regioesDF_t.length > 0) {
        const allCnes = []; regioesDF_t.forEach(r => allCnes.push(...(dfRegionSaudeMap[r] || []).map(String)));
        const uniqueCnes = [...new Set(allCnes)];
        if (uniqueCnes.length > 0) { espelhoConditions.push(`e.co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE co_cnes::text = ANY($${paramCount++}))`); allParams.push(uniqueCnes); }
      }
      const regioesAdmDF_t = normalizeArr(req.query.regiao_adm_df);
      if (regioesAdmDF_t.length > 0) {
        const allCnes = []; regioesAdmDF_t.forEach(r => allCnes.push(...(dfRegionAdmMap[r] || []).map(String)));
        const uniqueCnes = [...new Set(allCnes)];
        if (uniqueCnes.length > 0) { espelhoConditions.push(`e.co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE co_cnes::text = ANY($${paramCount++}))`); allParams.push(uniqueCnes); }
      }

      const cboValsT = normalizeArr(req.query.cbo);
      if (cboValsT.length > 0) {
        if (cboValsT.length === 1) { espelhoConditions.push(`e.co_cbo::text = $${paramCount++}`); allParams.push(cboValsT[0]); }
        else { espelhoConditions.push(`e.co_cbo::text = ANY($${paramCount++})`); allParams.push(cboValsT); }
      }
      const vinculoValsT = normalizeArr(req.query.vinculo);
      if (vinculoValsT.length > 0) {
        if (vinculoValsT.length === 1) { espelhoConditions.push(`e.ind_vinculacao::text = $${paramCount++}`); allParams.push(vinculoValsT[0]); }
        else { espelhoConditions.push(`e.ind_vinculacao::text = ANY($${paramCount++})`); allParams.push(vinculoValsT); }
      }
      const estabValsT = normalizeArr(req.query.estabelecimento);
      if (estabValsT.length > 0) {
        if (estabValsT.length === 1) { espelhoConditions.push(`e.co_cnes = $${paramCount++}`); allParams.push(estabValsT[0]); }
        else { espelhoConditions.push(`e.co_cnes = ANY($${paramCount++})`); allParams.push(estabValsT); }
      }
    }
    const espelhoWhereExtra = espelhoConditions.length > 0 ? '\n          AND ' + espelhoConditions.join('\n          AND ') : '';

    // ── 2. WHERE para recenseados_nova (todos os filtros via buildVinculosWhere) ──
    let { whereClause: recWhere, params: recParams, paramCount: recEnd } = buildVinculosWhere(req.query, [], paramCount);
    allParams.push(...recParams);
    paramCount = recEnd;

    // ── 3. Busca textual ──
    let buscaCondEspelho = '';
    if (busca && busca.trim()) {
      const buscaParam = `%${busca.trim()}%`;
      const buscaCond  = `(ds_cbo_ocupacao ILIKE $${paramCount} OR co_cnes::text ILIKE $${paramCount} OR vinculacao ILIKE $${paramCount})`;
      buscaCondEspelho = `AND (e.co_cbo::text ILIKE $${paramCount} OR e.co_cnes::text ILIKE $${paramCount} OR e.ind_vinculacao::text ILIKE $${paramCount})`;
      recWhere = recWhere ? recWhere + ` AND ${buscaCond}` : `WHERE ${buscaCond}`;
      allParams.push(buscaParam);
      paramCount++;
    }

    console.log('📋 Tabela - recWhere:', recWhere);
    console.log('📋 Tabela - includeEspelho:', includeEspelho, '| espelhoExtra:', espelhoWhereExtra || '(none)');

    // ── 5. Chave de deduplicação para o lado recenseados ──
    const dedupKey = `nu_cpf, co_cnes, co_cbo_ocupacao, nu_vinculacao,
      COALESCE(qt_carga_horaria_ambulatorial::text, ''), COALESCE(qt_carga_horaria_hospitalar::text, ''),
      COALESCE(qt_carga_horaria_outros::text, ''), no_tipo_operacao_censo`;

    // ── 6. Colunas de cada parte do UNION ALL ──
    const recCols = `
          SUBSTRING(nu_cpf, 8, 4)                            AS cpf_ultimos_4,
          nu_cpf,
          co_sexo,
          ds_cbo_ocupacao,
          vinculacao,
          COALESCE(qt_carga_horaria_ambulatorial, 0) +
            COALESCE(qt_carga_horaria_hospitalar, 0) +
            COALESCE(qt_carga_horaria_outros, 0)             AS carga_horaria_total,
          vl_remuneracao,
          no_tipo_operacao_censo,
          co_cnes::text                                      AS co_cnes,
          st_cnes,
          ds_escolaridade,
          ds_raca_cor,
          ds_cine,
          nome,
          co_cbo_ocupacao::text                              AS co_cbo_ocupacao,
          nu_vinculacao::text                                AS nu_vinculacao`;

    // espelhoCols referencia aliases dos JOINs declarados em naoAlteradosPart
    const espelhoCols = `
          SUBSTRING(LPAD(e.co_cpf::text, 11, '0'), 8, 4)    AS cpf_ultimos_4,
          LPAD(e.co_cpf::text, 11, '0')                     AS nu_cpf,
          cpf_info.co_sexo                                   AS co_sexo,
          cbo_desc.ds_cbo_ocupacao                           AS ds_cbo_ocupacao,
          vin_desc.vinculacao                                AS vinculacao,
          COALESCE(e.qt_carga_horaria_ambulatorial::numeric, 0) +
            COALESCE(e.qt_carga_hor_hosp_sus::numeric, 0) +
            COALESCE(e.qt_carga_horaria_outros::numeric, 0) AS carga_horaria_total,
          NULL::numeric                                      AS vl_remuneracao,
          'Não alterado'::text                               AS no_tipo_operacao_censo,
          e.co_cnes::text                                    AS co_cnes,
          NULL::text                                         AS st_cnes,
          NULL::text                                         AS ds_escolaridade,
          NULL::text                                         AS ds_raca_cor,
          NULL::text                                         AS ds_cine,
          cpf_info.nome                                      AS nome,
          e.co_cbo::text                                    AS co_cbo_ocupacao,
          e.ind_vinculacao::text                             AS nu_vinculacao`;

    // ── 7. Montar CTEs e UNION ALL ──
    const espelhoCtes = includeEspelho ? `
      min_comp_cte AS (SELECT MIN(nu_comp) AS nu_comp FROM censo.espelho_cnes_nova),
      espelho_min AS (
        SELECT e.*
        FROM censo.espelho_cnes_nova e
        WHERE e.nu_comp = (SELECT nu_comp FROM min_comp_cte)${espelhoWhereExtra}
      ),
      -- Lookups computados UMA VEZ para enriquecer registros do espelho (evita LATERAL por linha)
      cpf_lookup_cte AS (
        SELECT DISTINCT ON (nu_cpf) nu_cpf, nome, co_sexo
        FROM censo.recenseados_nova
        WHERE nu_cpf IS NOT NULL
        ORDER BY nu_cpf, nome NULLS LAST
      ),
      cbo_desc_cte AS (
        SELECT DISTINCT ON (co_cbo_ocupacao) co_cbo_ocupacao::text AS codigo, ds_cbo_ocupacao
        FROM censo.recenseados_nova
        WHERE co_cbo_ocupacao IS NOT NULL AND ds_cbo_ocupacao IS NOT NULL AND ds_cbo_ocupacao != ''
        ORDER BY co_cbo_ocupacao
      ),
      vin_desc_cte AS (
        SELECT DISTINCT ON (nu_vinculacao) nu_vinculacao::text AS codigo, vinculacao
        FROM censo.recenseados_nova
        WHERE nu_vinculacao IS NOT NULL AND vinculacao IS NOT NULL AND vinculacao != ''
        ORDER BY nu_vinculacao
      ),` : '';

    const naoAlteradosPart = includeEspelho ? `
      UNION ALL
      SELECT ${espelhoCols}
      FROM espelho_min e
      -- Nome e Sexo: lookup por CPF via CTE (hash join, eficiente para exportações grandes)
      LEFT JOIN cpf_lookup_cte cpf_info ON cpf_info.nu_cpf = e.co_cpf
      -- Descrição CBO e Vínculo: lookups por código via CTE
      LEFT JOIN cbo_desc_cte cbo_desc ON cbo_desc.codigo = e.co_cbo::text
      LEFT JOIN vin_desc_cte vin_desc ON vin_desc.codigo = e.ind_vinculacao::text
      WHERE NOT EXISTS (
        SELECT 1 FROM censo.recenseados_nova v
        WHERE v.nu_cpf                = e.co_cpf
          AND v.co_cnes               = e.co_cnes
          AND v.nu_vinculacao::text   = e.ind_vinculacao::text
          AND v.co_cbo_ocupacao::text = e.co_cbo::text
          AND COALESCE(v.qt_carga_horaria_ambulatorial::numeric, 0) = COALESCE(e.qt_carga_horaria_ambulatorial::numeric, 0)
          AND COALESCE(v.qt_carga_horaria_hospitalar::numeric, 0)   = COALESCE(e.qt_carga_hor_hosp_sus::numeric, 0)
          AND COALESCE(v.qt_carga_horaria_outros::numeric, 0)       = COALESCE(e.qt_carga_horaria_outros::numeric, 0)
      )${buscaCondEspelho}` : '';

    // Query única com window function para evitar double-scan do NOT EXISTS
    const sql = `
      WITH
      ${espelhoCtes}
      recenseados_dedup AS (
        SELECT DISTINCT ON (${dedupKey}) ${recCols}
        FROM censo.recenseados_nova
        ${recWhere}
        ORDER BY ${dedupKey}
      ),
      all_data AS (
        SELECT * FROM recenseados_dedup
        ${naoAlteradosPart}
      )
      SELECT *, COUNT(*) OVER() AS total_count
      FROM all_data
      ORDER BY nu_cpf
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    console.log('📋 Tabela SQL (primeiros 600 chars):', sql.substring(0, 600));

    const { rows } = await pool.query(sql, [...allParams, limit, offset]);
    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data  = rows.map(({ total_count, ...rest }) => rest);

    res.json({
      data,
      pagination: {
        page:  parseInt(page),
        limit: parseInt(limit),
        total,
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
 * Usa a menor competência disponível em censo.espelho_cnes_nova dinamicamente.
 * Suporta os mesmos filtros de /api/vinculos/stats:
 *   uf, macro, regional, municipio, regiao_saude_df, regiao_adm_df, estabelecimento,
 *   cbo, vinculo  → aplicados ao espelho_cnes_nova
 *   sexo, escolaridade, raca, cine, operacao → aplicados apenas ao lado recenseados_nova
 */
app.get('/api/vinculos/nao-alterados', async (req, res) => {
  try {
    const allParams = [];
    let paramCount  = 1;

    // ── 1. Condições para espelho_cnes_nova (localização + CBO + vínculo + estabelecimento) ──
    const espelhoConditions = [];

    const addEspelhoSubq = (col, val) => {
      const vals = normalizeArr(val);
      if (!vals.length) return;
      if (vals.length === 1) {
        espelhoConditions.push(`e.co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE ${col} = $${paramCount++})`);
        allParams.push(vals[0]);
      } else {
        espelhoConditions.push(`e.co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE ${col} = ANY($${paramCount++}))`);
        allParams.push(vals);
      }
    };

    addEspelhoSubq('sg_uf',             req.query.uf);
    addEspelhoSubq('no_macrorregional',  req.query.macro);
    addEspelhoSubq('no_regional_saude',  req.query.regional);
    addEspelhoSubq('no_municipio',       req.query.municipio);

    // Regiões de Saúde DF
    const regioesDF = normalizeArr(req.query.regiao_saude_df);
    if (regioesDF.length > 0) {
      const allCnes = [];
      regioesDF.forEach(r => allCnes.push(...(dfRegionSaudeMap[r] || []).map(String)));
      const uniqueCnes = [...new Set(allCnes)];
      if (uniqueCnes.length > 0) {
        espelhoConditions.push(`e.co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE co_cnes::text = ANY($${paramCount++}))`);
        allParams.push(uniqueCnes);
      }
    }
    // Regiões Administrativas DF
    const regioesAdmDF = normalizeArr(req.query.regiao_adm_df);
    if (regioesAdmDF.length > 0) {
      const allCnes = [];
      regioesAdmDF.forEach(r => allCnes.push(...(dfRegionAdmMap[r] || []).map(String)));
      const uniqueCnes = [...new Set(allCnes)];
      if (uniqueCnes.length > 0) {
        espelhoConditions.push(`e.co_cnes IN (SELECT co_cnes FROM censo.recenseamento_nova WHERE co_cnes::text = ANY($${paramCount++}))`);
        allParams.push(uniqueCnes);
      }
    }

    // CBO → espelho usa coluna co_cbo
    const cboValsE = normalizeArr(req.query.cbo);
    if (cboValsE.length > 0) {
      if (cboValsE.length === 1) {
        espelhoConditions.push(`e.co_cbo::text = $${paramCount++}`);
        allParams.push(cboValsE[0]);
      } else {
        espelhoConditions.push(`e.co_cbo::text = ANY($${paramCount++})`);
        allParams.push(cboValsE);
      }
    }

    // Vínculo → espelho usa coluna ind_vinculacao
    const vinculoValsE = normalizeArr(req.query.vinculo);
    if (vinculoValsE.length > 0) {
      if (vinculoValsE.length === 1) {
        espelhoConditions.push(`e.ind_vinculacao::text = $${paramCount++}`);
        allParams.push(vinculoValsE[0]);
      } else {
        espelhoConditions.push(`e.ind_vinculacao::text = ANY($${paramCount++})`);
        allParams.push(vinculoValsE);
      }
    }

    // Estabelecimento
    const estabValsE = normalizeArr(req.query.estabelecimento);
    if (estabValsE.length > 0) {
      if (estabValsE.length === 1) {
        espelhoConditions.push(`e.co_cnes = $${paramCount++}`);
        allParams.push(estabValsE[0]);
      } else {
        espelhoConditions.push(`e.co_cnes = ANY($${paramCount++})`);
        allParams.push(estabValsE);
      }
    }

    const espelhoWhereExtra = espelhoConditions.length > 0
      ? '\n        AND ' + espelhoConditions.join('\n        AND ')
      : '';

    // ── 2. Filtros exclusivos de recenseados_nova no NOT EXISTS (sexo, raca, esc, cine, op) ──
    const vConditions = [];

    // Sexo (sem parâmetro — inline)
    const sexoValsV = normalizeArr(req.query.sexo);
    if (sexoValsV.length > 0) {
      const masc = sexoValsV.some(v => v === 'M' || v === 'Masculino');
      const fem  = sexoValsV.some(v => v === 'F' || v === 'Feminino');
      if (masc && !fem)      vConditions.push(`v.co_sexo IN ('M', '1')`);
      else if (fem && !masc) vConditions.push(`v.co_sexo IN ('F', '2')`);
    }

    // Escolaridade
    const escValsV = normalizeArr(req.query.escolaridade);
    if (escValsV.length > 0) {
      if (escValsV.length === 1) {
        vConditions.push(`(v.co_escolaridade::text = $${paramCount} OR v.ds_escolaridade = $${paramCount})`);
        allParams.push(escValsV[0]); paramCount++;
      } else {
        vConditions.push(`(v.co_escolaridade::text = ANY($${paramCount}) OR v.ds_escolaridade = ANY($${paramCount}))`);
        allParams.push(escValsV); paramCount++;
      }
    }

    // Raça/Cor
    const racaValsV = normalizeArr(req.query.raca);
    if (racaValsV.length > 0) {
      const semInfo = racaValsV.includes('Sem informação');
      const outros  = racaValsV.filter(v => v !== 'Sem informação');
      if (semInfo && outros.length === 0) {
        vConditions.push(`(v.ds_raca_cor IS NULL OR v.ds_raca_cor = '' OR UPPER(v.ds_raca_cor) = 'SEM INFORMACAO')`);
      } else if (!semInfo && outros.length > 0) {
        if (outros.length === 1) { vConditions.push(`v.ds_raca_cor = $${paramCount++}`);          allParams.push(outros[0]); }
        else                     { vConditions.push(`v.ds_raca_cor = ANY($${paramCount++})`);      allParams.push(outros); }
      } else if (semInfo && outros.length > 0) {
        if (outros.length === 1) { vConditions.push(`(v.ds_raca_cor IS NULL OR v.ds_raca_cor = '' OR UPPER(v.ds_raca_cor) = 'SEM INFORMACAO' OR v.ds_raca_cor = $${paramCount++})`);      allParams.push(outros[0]); }
        else                     { vConditions.push(`(v.ds_raca_cor IS NULL OR v.ds_raca_cor = '' OR UPPER(v.ds_raca_cor) = 'SEM INFORMACAO' OR v.ds_raca_cor = ANY($${paramCount++}))`); allParams.push(outros); }
      }
    }

    // CINE
    const cineValsV = normalizeArr(req.query.cine);
    if (cineValsV.length > 0) {
      if (cineValsV.length === 1) {
        vConditions.push(`(v.co_cine = $${paramCount} OR v.ds_cine = $${paramCount})`);
        allParams.push(cineValsV[0]); paramCount++;
      } else {
        vConditions.push(`(v.co_cine = ANY($${paramCount}) OR v.ds_cine = ANY($${paramCount}))`);
        allParams.push(cineValsV); paramCount++;
      }
    }

    // Tipo de Operação
    const opValsV = normalizeArr(req.query.operacao);
    if (opValsV.length > 0) {
      if (opValsV.length === 1) { vConditions.push(`v.no_tipo_operacao_censo = $${paramCount++}`); allParams.push(opValsV[0]); }
      else                      { vConditions.push(`v.no_tipo_operacao_censo = ANY($${paramCount++})`); allParams.push(opValsV); }
    }

    const vWhereExtra = vConditions.length > 0
      ? '\n              AND ' + vConditions.join('\n              AND ')
      : '';

    // ── 3. WHERE para total_rec usando buildVinculosWhere (todos os filtros) ──
    const { whereClause: recWhere, params: recParams } = buildVinculosWhere(req.query, [], paramCount);
    const finalParams = [...allParams, ...recParams];

    const sql = `
      WITH
      min_comp_cte AS (
        SELECT MIN(nu_comp) AS nu_comp FROM censo.espelho_cnes_nova
      ),
      espelho_min AS (
        SELECT e.*
        FROM censo.espelho_cnes_nova e
        WHERE e.nu_comp = (SELECT nu_comp FROM min_comp_cte)${espelhoWhereExtra}
      ),
      nao_alt_cte AS (
        SELECT COUNT(*) AS n
        FROM espelho_min e
        WHERE NOT EXISTS (
          SELECT 1 FROM censo.recenseados_nova v
          WHERE v.nu_cpf                = e.co_cpf
            AND v.co_cnes               = e.co_cnes
            AND v.nu_vinculacao::text   = e.ind_vinculacao::text
            AND v.co_cbo_ocupacao::text = e.co_cbo::text
            AND COALESCE(v.qt_carga_horaria_ambulatorial::numeric, 0) = COALESCE(e.qt_carga_horaria_ambulatorial::numeric, 0)
            AND COALESCE(v.qt_carga_horaria_hospitalar::numeric, 0)   = COALESCE(e.qt_carga_hor_hosp_sus::numeric, 0)
            AND COALESCE(v.qt_carga_horaria_outros::numeric, 0)       = COALESCE(e.qt_carga_horaria_outros::numeric, 0)${vWhereExtra}
        )
      ),
      total_rec AS (SELECT COUNT(*) AS n FROM censo.recenseados_nova ${recWhere})
      SELECT
        (SELECT nu_comp FROM min_comp_cte) AS nu_comp,
        (SELECT COUNT(*) FROM espelho_min) AS total_espelho,
        (SELECT n FROM total_rec)          AS total_vinculos_recenseados,
        (SELECT n FROM nao_alt_cte)        AS nao_alterados
    `;

    const { rows } = await pool.query(sql, finalParams);

    const compStr  = String(rows[0].nu_comp);
    const mesesNome = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const labelComp = `${mesesNome[parseInt(compStr.slice(4,6)) - 1]}/${compStr.slice(0,4)}`;

    const totalEspelho             = parseInt(rows[0].total_espelho);
    const totalVinculosRecenseados = parseInt(rows[0].total_vinculos_recenseados);
    const naoAlterados             = parseInt(rows[0].nao_alterados);
    const alterados                = totalEspelho - naoAlterados;
    const cobertura                = totalEspelho > 0 ? ((alterados / totalEspelho) * 100).toFixed(1) : '0';

    res.json({
      competencia: compStr,
      label: labelComp,
      total_espelho: totalEspelho,
      total_vinculos_recenseados: totalVinculosRecenseados,
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

  // Helper local para adicionar filtro com suporte a array (= ou ANY)
  const addF = (col, val) => {
    const vals = normalizeArr(val);
    if (vals.length === 0) return;
    if (vals.length === 1) { conditions.push(`${col} = $${paramIndex}`); params.push(vals[0]); }
    else                   { conditions.push(`${col} = ANY($${paramIndex})`); params.push(vals); }
    paramIndex++;
  };

  addF('r.sg_uf',                  filters.uf);
  addF('r.no_macrorregional',       filters.macro);
  addF('r.no_regional_saude',       filters.regional);
  addF('r.no_municipio',            filters.municipio);
  addF('r.recenseador',             filters.recenseador);

  // Regiões DF — agrega CNES de todas as selecionadas
  const regioesDF = normalizeArr(filters.regiao_saude_df);
  if (regioesDF.length > 0) {
    const allCnes = [];
    regioesDF.forEach(r => allCnes.push(...(dfRegionSaudeMap[r] || []).map(String)));
    const uniqueCnes = [...new Set(allCnes)];
    if (uniqueCnes.length > 0) { conditions.push(`r.co_cnes::text = ANY($${paramIndex++})`); params.push(uniqueCnes); }
    console.log(`  ✓ Filtro Região de Saúde DF aplicado: ${regioesDF}`);
  }
  const regioesAdmDF = normalizeArr(filters.regiao_adm_df);
  if (regioesAdmDF.length > 0) {
    const allCnes = [];
    regioesAdmDF.forEach(r => allCnes.push(...(dfRegionAdmMap[r] || []).map(String)));
    const uniqueCnes = [...new Set(allCnes)];
    if (uniqueCnes.length > 0) { conditions.push(`r.co_cnes::text = ANY($${paramIndex++})`); params.push(uniqueCnes); }
    console.log(`  ✓ Filtro Região Administrativa DF aplicado: ${regioesAdmDF}`);
  }

  // Tipo de Operação (aceita 'op' ou 'operacao')
  const opVal = filters.op || filters.operacao;
  if (opVal) {
    const opVals = normalizeArr(opVal);
    if (opVals.length === 1) { conditions.push(`v.no_tipo_operacao_censo = $${paramIndex}`); params.push(opVals[0]); }
    else                     { conditions.push(`v.no_tipo_operacao_censo = ANY($${paramIndex})`); params.push(opVals); }
    paramIndex++;
    console.log(`  ✓ Filtro Operação aplicado: ${opVals}`);
  }

  // CBO (multi)
  const cboVals = normalizeArr(filters.cbo);
  if (cboVals.length > 0) {
    if (cboVals.length === 1) { conditions.push(`(v.co_cbo_ocupacao = $${paramIndex} OR v.ds_cbo_ocupacao = $${paramIndex})`); params.push(cboVals[0]); }
    else                      { conditions.push(`(v.co_cbo_ocupacao = ANY($${paramIndex}) OR v.ds_cbo_ocupacao = ANY($${paramIndex}))`); params.push(cboVals); }
    paramIndex++;
    console.log(`  ✓ Filtro CBO aplicado: ${cboVals}`);
  }

  // Estabelecimento (multi)
  const estabVals = normalizeArr(filters.estabelecimento);
  if (estabVals.length > 0) {
    if (estabVals.length === 1) { conditions.push(`(v.co_cnes = $${paramIndex} OR r.no_razao_social = $${paramIndex})`); params.push(estabVals[0]); }
    else                        { conditions.push(`(v.co_cnes = ANY($${paramIndex}) OR r.no_razao_social = ANY($${paramIndex}))`); params.push(estabVals); }
    paramIndex++;
    console.log(`  ✓ Filtro Estabelecimento aplicado: ${estabVals}`);
  }

  // Filtro: Período de Conclusão do Censo (coluna coletado_em em recenseamento_nova)
  if (filters.periodo_inicio) {
    conditions.push(`r.coletado_em::date >= $${paramIndex}`);
    params.push(filters.periodo_inicio);
    paramIndex++;
    console.log(`  ✓ Filtro Período início: ${filters.periodo_inicio}`);
  }
  if (filters.periodo_fim) {
    conditions.push(`r.coletado_em::date <= $${paramIndex}`);
    params.push(filters.periodo_fim);
    paramIndex++;
    console.log(`  ✓ Filtro Período fim: ${filters.periodo_fim}`);
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
    const _rawComp = req.query.comp || req.query.competencia || null;
    const competencia = Array.isArray(_rawComp) ? (_rawComp[0] || null) : (_rawComp || null); // Aceitar 'comp' ou 'competencia'; normaliza array → string

    console.log('📊 /api/resolucao/stats chamado');
    console.log('📊 Competência recebida:', competencia || 'TODAS');
    console.log('📊 Query params:', req.query);

    // Se competência específica; sem filtro → usa a competência mais recente para evitar
    // que o JOIN varra todas as competências do espelho simultaneamente (timeout)
    const compFilter = competencia
      ? `AND e.nu_comp = '${competencia}'`
      : `AND e.nu_comp = (SELECT MAX(nu_comp) FROM censo.espelho_cnes_nova)`;

    // Verificar se há filtros que exigem JOIN com recenseamento
    const needsRecenseamentoJoin = !!(
      req.query.uf ||
      req.query.macro ||
      req.query.regional ||
      req.query.municipio ||
      req.query.recenseador ||
      req.query.estabelecimento ||
      req.query.periodo_inicio ||
      req.query.periodo_fim
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

    // Query principal unificada: uma única varredura em recenseados_nova calcula
    // total de divergências, resolvidas e métricas por estabelecimento
    const mainStatsQuery = `
      WITH resolucao_por_estab AS (
        SELECT
          v.co_cnes,
          COUNT(DISTINCT ${CHAVE_V})          AS total,
          COUNT(DISTINCT ${RESOLVIDA_CASE_V}) AS resolvidas
        FROM censo.recenseados_nova v
        ${recenseamentoJoin}
        LEFT JOIN censo.espelho_cnes_nova e
          ON e.co_cpf          = v.nu_cpf
          AND e.co_cnes         = v.co_cnes
          AND e.co_cbo          = v.co_cbo_ocupacao::text
          AND e.ind_vinculacao  = v.nu_vinculacao
          ${compFilter}
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
        GROUP BY v.co_cnes
      )
      SELECT
        COALESCE(SUM(total),     0)::bigint                                 AS total_divergencias,
        COALESCE(SUM(resolvidas),0)::bigint                                 AS divergencias_resolvidas,
        COUNT(*) FILTER (WHERE resolvidas  = total)::bigint                 AS estabs_com_resolucao,
        COUNT(*) FILTER (WHERE resolvidas  < total)::bigint                 AS estabs_com_pendencias
      FROM resolucao_por_estab
    `;

    // Query de total de estabelecimentos recenseados (concluídos)
    const totalEstabsRecenseadosQuery = whereClause
      ? `SELECT COUNT(DISTINCT r.co_cnes) AS n
         FROM censo.recenseamento_nova r
         WHERE r.situacao_recenseamento = 'Concluído'
           AND r.co_cnes IN (
             SELECT DISTINCT v.co_cnes FROM censo.recenseados_nova v
             INNER JOIN censo.recenseamento_nova r2 ON r2.co_cnes = v.co_cnes
             ${whereClause}
           )`
      : `SELECT COUNT(*) AS n FROM censo.recenseamento_nova WHERE situacao_recenseamento = 'Concluído'`;

    // Executar em paralelo: query principal + competências + estabs recenseados
    const [mainRow, competencias, totalEstabsRes] = await Promise.all([
      params.length > 0 ? pool.query(mainStatsQuery, params) : pool.query(mainStatsQuery),
      pool.query(competenciasQuery),
      params.length > 0 ? pool.query(totalEstabsRecenseadosQuery, params) : pool.query(totalEstabsRecenseadosQuery)
    ]);

    const total               = parseInt(mainRow.rows[0].total_divergencias);
    const totalResolvidas     = parseInt(mainRow.rows[0].divergencias_resolvidas);
    const estabsComResolucao  = parseInt(mainRow.rows[0].estabs_com_resolucao  || 0);
    const estabsComPendencias = parseInt(mainRow.rows[0].estabs_com_pendencias || 0);
    const totalEstabsRecenseados = parseInt(totalEstabsRes.rows[0].n || 0);

    const pendentes     = total - totalResolvidas;
    const taxaResolucao = total > 0 ? ((totalResolvidas / total) * 100).toFixed(1) : 0;
    // Estabs sem divergência = Total Recenseados − Com Resolução − Com Pendência
    const estabsSemDivergencia = Math.max(0, totalEstabsRecenseados - estabsComResolucao - estabsComPendencias);

    console.log('📊 Stats calculados:');
    console.log('  Total divergências:', total, '| Resolvidas:', totalResolvidas, '| Pendentes:', pendentes);
    console.log('  Estabs: recenseados', totalEstabsRecenseados, '| resolvidos', estabsComResolucao, '| pendentes', estabsComPendencias, '| sem divergência', estabsSemDivergencia);

    res.json({
      total_divergencias: total,
      divergencias_resolvidas: totalResolvidas,
      divergencias_pendentes: pendentes,
      taxa_resolucao: parseFloat(taxaResolucao),
      estabs_com_resolucao: estabsComResolucao,
      estabs_com_pendencias: estabsComPendencias,
      estabs_sem_divergencia: estabsSemDivergencia,
      total_estabs_recenseados: totalEstabsRecenseados,
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
    const _rawComp = req.query.comp || req.query.competencia || null;
    const competencia = Array.isArray(_rawComp) ? (_rawComp[0] || null) : (_rawComp || null); // Aceitar 'comp' ou 'competencia'; normaliza array → string

    // Verificar se há filtros que exigem JOIN com recenseamento
    const needsRecenseamentoJoin = !!(
      req.query.uf ||
      req.query.macro ||
      req.query.regional ||
      req.query.municipio ||
      req.query.recenseador ||
      req.query.estabelecimento ||
      req.query.periodo_inicio ||
      req.query.periodo_fim
    );

    // JOIN com recenseamento (apenas se necessário)
    const recenseamentoJoin = needsRecenseamentoJoin
      ? 'INNER JOIN censo.recenseamento_nova r ON v.co_cnes = r.co_cnes'
      : '';

    // Sem competência → usa a mais recente para não varrer todas as competências do espelho
    const compFilter = competencia
      ? `AND e.nu_comp::text = '${competencia}'`
      : `AND e.nu_comp = (SELECT MAX(nu_comp) FROM censo.espelho_cnes_nova)`;
    const compJoin = `LEFT JOIN censo.espelho_cnes_nova e ON e.co_cpf = v.nu_cpf AND e.co_cnes = v.co_cnes AND e.co_cbo = v.co_cbo_ocupacao::text AND e.ind_vinculacao = v.nu_vinculacao ${compFilter}`;

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

    // Helper para queries simples com ou sem params
    const runQ = (sql) => params.length > 0 ? pool.query(sql, params) : pool.query(sql);

    // Helper para queries com timeout isolado — retorna { rows: [] } se exceder o limite
    const runQTimeout = async (sql, ms = 120000) => {
      try { return await queryComTimeout(sql, params, ms); }
      catch (err) { console.warn('⚠️ Query ignorada (timeout/erro):', err.message); return { rows: [] }; }
    };

    // Executar TODAS as queries em paralelo:
    //   • evolucao e evolucaoAcumulada → timeout isolado (JOIN pesado no espelho)
    //   • tipo, cbo, cnes, cboPendentes, cnesPendentes → sem timeout (query mais leve)
    //   • espelhoPorComp → sem filtro de params, sempre rápida
    console.log('📊 Disparando todas as queries de agregados em paralelo...');
    const [
      evolucao,
      evolucaoAcumulada,
      tipo,
      cbo,
      cnes,
      cboPendentes,
      cnesPendentes,
      espelhoPorComp
    ] = await Promise.all([
      runQTimeout(evolucaoQuery),
      runQTimeout(evolucaoAcumuladaQuery),
      runQ(tipoQuery),
      runQ(cboQuery),
      runQ(cnesQuery),
      runQ(cboPendentesQuery),
      runQ(cnesPendentesQuery),
      pool.query(`
        SELECT nu_comp, COUNT(*) AS total_cnes
        FROM censo.espelho_cnes_nova
        GROUP BY nu_comp
        ORDER BY nu_comp
      `)
    ]);

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
        ORDER BY nu_comp::text DESC
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
      
      // Macrorregião (inclui sg_uf para cascata no cliente)
      pool.query(`
        SELECT DISTINCT
          no_macrorregional as codigo,
          no_macrorregional as descricao,
          no_macrorregional as valor,
          sg_uf             as uf
        FROM censo.recenseamento_nova
        WHERE no_macrorregional IS NOT NULL
        ORDER BY no_macrorregional
      `),

      // Região de Saúde (inclui sg_uf para cascata no cliente)
      pool.query(`
        SELECT DISTINCT
          no_regional_saude as codigo,
          no_regional_saude as descricao,
          no_regional_saude as valor,
          sg_uf             as uf
        FROM censo.recenseamento_nova
        WHERE no_regional_saude IS NOT NULL
        ORDER BY no_regional_saude
      `),

      // Município (inclui sg_uf para cascata no cliente)
      pool.query(`
        SELECT DISTINCT
          no_municipio as codigo,
          no_municipio as descricao,
          no_municipio as valor,
          sg_uf        as uf
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
    const _rawComp = req.query.comp || req.query.competencia || null;
    const competencia = Array.isArray(_rawComp) ? (_rawComp[0] || null) : (_rawComp || null);
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

    // Sem competência → usa a mais recente para não varrer todas as competências do espelho
    const compFilter = competencia
      ? `AND e.nu_comp = '${competencia}'`
      : `AND e.nu_comp = (SELECT MAX(nu_comp) FROM censo.espelho_cnes_nova)`;

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

/**
 * GET /api/resolucao/estabelecimentos-pendentes
 * Lista de estabelecimentos com divergências pendentes (não resolvidas)
 */
app.get('/api/resolucao/estabelecimentos-pendentes', async (req, res) => {
  try {
    const { whereClause, params } = buildResolucaoWhere(req.query);
    const _rawComp = req.query.comp || req.query.competencia || null;
    const competencia = Array.isArray(_rawComp) ? (_rawComp[0] || null) : (_rawComp || null);
    // Sem competência → usa a mais recente para não varrer todas as competências do espelho
    const compFilter  = competencia
      ? `AND e.nu_comp::text = '${competencia}'`
      : `AND e.nu_comp = (SELECT MAX(nu_comp) FROM censo.espelho_cnes_nova)`;

    // Sempre faz JOIN com recenseamento (precisamos de nome, UF, município)
    const recJoin = 'INNER JOIN censo.recenseamento_nova r ON v.co_cnes = r.co_cnes';

    const resolvidasCTE = `resolvidas_eq AS (
      SELECT DISTINCT ${CHAVE_V} AS chave
      FROM censo.recenseados_nova v ${recJoin}
      INNER JOIN censo.espelho_cnes_nova e
        ON e.co_cpf = v.nu_cpf AND e.co_cnes = v.co_cnes
        AND e.co_cbo = v.co_cbo_ocupacao::text AND e.ind_vinculacao = v.nu_vinculacao ${compFilter}
      ${whereClause} ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Inclusão'
      UNION ALL
      SELECT DISTINCT ${CHAVE_V} AS chave
      FROM censo.recenseados_nova v ${recJoin}
      LEFT JOIN censo.espelho_cnes_nova e
        ON e.co_cpf = v.nu_cpf AND e.co_cnes = v.co_cnes
        AND e.co_cbo = v.co_cbo_ocupacao::text AND e.ind_vinculacao = v.nu_vinculacao ${compFilter}
      ${whereClause} ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo = 'Exclusão'
        AND e.co_cpf IS NULL
      UNION ALL
      SELECT DISTINCT ${CHAVE_V} AS chave
      FROM censo.recenseados_nova v ${recJoin}
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

    const sql = `
      WITH ${resolvidasCTE}
      SELECT
        v.co_cnes,
        MAX(r.no_razao_social)                                            AS no_razao_social,
        MAX(r.sg_uf)                                                      AS sg_uf,
        MAX(r.no_municipio)                                               AS no_municipio,
        COUNT(DISTINCT ${CHAVE_V})                                        AS total,
        COUNT(DISTINCT rv.chave)                                          AS resolvidas,
        COUNT(DISTINCT ${CHAVE_V}) - COUNT(DISTINCT rv.chave)            AS pendentes
      FROM censo.recenseados_nova v
      ${recJoin}
      LEFT JOIN resolvidas_eq rv ON rv.chave = ${CHAVE_V}
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} v.no_tipo_operacao_censo IS NOT NULL
      GROUP BY v.co_cnes
      HAVING COUNT(DISTINCT ${CHAVE_V}) - COUNT(DISTINCT rv.chave) > 0
      ORDER BY pendentes DESC, total DESC
      LIMIT 500
    `;

    const result = params.length > 0
      ? await pool.query(sql, params)
      : await pool.query(sql);

    res.json({
      data: result.rows.map(r => ({
        co_cnes:        r.co_cnes,
        no_razao_social: r.no_razao_social || '—',
        sg_uf:          r.sg_uf || '—',
        no_municipio:   r.no_municipio || '—',
        total:          parseInt(r.total),
        resolvidas:     parseInt(r.resolvidas),
        pendentes:      parseInt(r.pendentes)
      })),
      total: result.rows.length
    });

  } catch (err) {
    console.error('Erro em /api/resolucao/estabelecimentos-pendentes:', err);
    res.status(500).json({ error: 'Erro ao buscar estabelecimentos pendentes', details: err.message });
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
