/**
 * Configuração da API - FioCruz Painéis
 * 
 * INSTRUÇÕES:
 * 1. Se a API está rodando localmente: use 'http://localhost:3000'
 * 2. Se a API está em produção: troque para 'https://sua-api.com'
 * 3. Salve este arquivo como 'api-config.js' na mesma pasta dos painéis
 */

const API_CONFIG = {
  // URL base da API
  BASE_URL: 'http://localhost:3000',
  
  // Timeout para requisições (em milissegundos)
  TIMEOUT: 120000, // 120 segundos (queries pesadas)
  
  // Retries em caso de falha
  MAX_RETRIES: 3,
  
  // Endpoints
  ENDPOINTS: {
    // Estabelecimentos
    ESTABELECIMENTOS_STATS: '/api/estabelecimentos/stats',
    ESTABELECIMENTOS_POR_SITUACAO: '/api/estabelecimentos/por-situacao',
    ESTABELECIMENTOS_POR_UF: '/api/estabelecimentos/por-uf',
    ESTABELECIMENTOS_POR_ESFERA: '/api/estabelecimentos/por-esfera',
    ESTABELECIMENTOS_POR_MACRO: '/api/estabelecimentos/por-macro',
    ESTABELECIMENTOS_POR_REGIONAL: '/api/estabelecimentos/por-regional',
    ESTABELECIMENTOS_POR_RECENSEADOR: '/api/estabelecimentos/por-recenseador',
    ESTABELECIMENTOS_LISTA: '/api/estabelecimentos/lista',
    ESTABELECIMENTOS_FILTROS: '/api/estabelecimentos/filtros',
    
    // Vínculos
    VINCULOS_STATS: '/api/vinculos/stats',
    VINCULOS_AGREGADOS: '/api/vinculos/agregados',
    VINCULOS_TABELA: '/api/vinculos/tabela',
    VINCULOS_FILTROS: '/api/vinculos/filtros',
    VINCULOS_NAO_ALTERADOS: '/api/vinculos/nao-alterados',
    
    // Resolução
    RESOLUCAO_STATS: '/api/resolucao/stats',
    RESOLUCAO_AGREGADOS: '/api/resolucao/agregados',
    RESOLUCAO_FILTROS: '/api/resolucao/filtros',
    RESOLUCAO_TABELA: '/api/resolucao/tabela',
    
    // Sistema
    HEALTH: '/health'
  }
};

/**
 * Função auxiliar para fazer requisições com retry e timeout
 */
async function fetchWithRetry(url, options = {}, retries = API_CONFIG.MAX_RETRIES, timeout = API_CONFIG.TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (retries > 0 && error.name !== 'AbortError') {
      console.warn(`Tentando novamente... (${retries} tentativas restantes)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchWithRetry(url, options, retries - 1, timeout);
    }
    
    throw error;
  }
}

/**
 * Função para fazer requisição à API
 */
// Timeouts específicos por endpoint (ms). Endpoints pesados recebem mais tempo.
const ENDPOINT_TIMEOUTS = {
  '/api/resolucao/agregados': 300000, // 5 min — 5 queries sequenciais + 2 com fallback
  '/api/resolucao/stats':     180000, // 3 min — 5 queries sequenciais
  '/api/resolucao/tabela':    120000,
  '/api/vinculos/agregados':  180000,
};

async function apiRequest(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `${API_CONFIG.BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;
  const timeout = ENDPOINT_TIMEOUTS[endpoint] || API_CONFIG.TIMEOUT;

  console.log(`[API] Requisição: ${endpoint} (timeout: ${timeout / 1000}s)`);

  try {
    const data = await fetchWithRetry(url, {}, API_CONFIG.MAX_RETRIES, timeout);
    console.log(`[API] Sucesso: ${endpoint}`);
    return { success: true, data };
  } catch (error) {
    console.error(`[API] Erro em ${endpoint}:`, error.message);
    return {
      success: false,
      error: error.message,
      endpoint
    };
  }
}

/**
 * Verificar se a API está online
 */
async function checkApiHealth() {
  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.HEALTH}`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok';
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Exportar para uso global
window.API_CONFIG = API_CONFIG;
window.apiRequest = apiRequest;
window.checkApiHealth = checkApiHealth;
