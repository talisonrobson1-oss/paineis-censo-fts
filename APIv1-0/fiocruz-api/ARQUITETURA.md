# 🏗️ ARQUITETURA DA API FioCruz

## 📊 Visão Geral

```
┌─────────────────┐
│  Painéis HTML   │
│  (Frontend)     │
└────────┬────────┘
         │ HTTP/HTTPS
         │ fetch()
         ▼
┌─────────────────┐
│   API Express   │  ← server.js (Porta 3000)
│   (Node.js)     │
└────────┬────────┘
         │ SQL Queries
         │ pg (Pool)
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   177.85.162... │
│   Porta 54329   │
│                 │
│  Schema: censo  │
│  ├─ espelho_cnes│
│  ├─ recenseamento│
│  └─ vinculos    │
└─────────────────┘
```

## 🔄 Fluxo de Dados

### 1. Painel de Estabelecimentos

```
Usuário abre painel → HTML carrega
           ↓
    fetch('/api/estabelecimentos/stats')
           ↓
    Express recebe requisição
           ↓
    Query: SELECT COUNT(*), ... FROM censo.recenseamento
           ↓
    PostgreSQL processa
           ↓
    Retorna JSON
           ↓
    HTML atualiza gráficos (Chart.js)
```

### 2. Painel de Vínculos

```
Usuário abre painel → HTML carrega
           ↓
    fetch('/api/vinculos/agregados')
           ↓
    Express executa múltiplas queries em paralelo
           ↓
    Promise.all([
      query operação,
      query sexo,
      query raça,
      query escolaridade,
      ... (11 queries)
    ])
           ↓
    PostgreSQL processa todas
           ↓
    Retorna JSON agregado
           ↓
    HTML renderiza todos os gráficos
```

### 3. Tabela Paginada (Vínculos)

```
Usuário altera filtros/página
           ↓
    fetch('/api/vinculos/tabela?page=2&limit=30&sexo=F')
           ↓
    Express constrói query dinâmica
           ↓
    WHERE co_sexo = 'F'
    LIMIT 30 OFFSET 30
           ↓
    PostgreSQL retorna página 2
           ↓
    HTML atualiza tabela
```

## 🗂️ Estrutura de Arquivos

```
api-fiocruz/
│
├── server.js              # API principal (Express + rotas)
├── package.json           # Dependências NPM
├── .env                   # Configurações (não commitar!)
├── .env.example           # Exemplo de configurações
├── .gitignore             # Arquivos ignorados no Git
│
├── README.md              # Documentação completa
├── GUIA-RAPIDO.md         # Instalação rápida
├── ARQUITETURA.md         # Este arquivo
│
├── inspect-database.js    # Script para inspecionar banco
└── test-api.sh            # Script de testes
```

## 🔌 Pool de Conexões

```javascript
const pool = new Pool({
  host: '177.85.162.132',
  port: 54329,
  database: 'db_dataware',
  user: 'usr_censo',
  password: 'agsus@censo',
  max: 20,                    // Máximo 20 conexões simultâneas
  idleTimeoutMillis: 30000,   // Fecha conexão ociosa após 30s
  connectionTimeoutMillis: 2000 // Timeout de conexão: 2s
});
```

### Por que usar Pool?

- ✅ Reutiliza conexões (performance)
- ✅ Limite de conexões simultâneas
- ✅ Reconexão automática em caso de falha
- ✅ Gerenciamento eficiente de recursos

## 📡 Endpoints por Painel

### Painel de Estabelecimentos

| Endpoint | Método | Descrição | Dados Retornados |
|----------|--------|-----------|------------------|
| `/api/estabelecimentos/stats` | GET | Estatísticas gerais | Total, UFs, situações |
| `/api/estabelecimentos/por-situacao` | GET | Agrupamento | Quantidade por situação |
| `/api/estabelecimentos/por-uf` | GET | Distribuição | Quantidade por UF |

**Tabelas acessadas:** `censo.recenseamento`

---

### Painel de Vínculos

| Endpoint | Método | Descrição | Dados Retornados |
|----------|--------|-----------|------------------|
| `/api/vinculos/stats` | GET | Estatísticas gerais | Totais, médias, contagens |
| `/api/vinculos/agregados` | GET | Todos os gráficos | 11 agregações em paralelo |
| `/api/vinculos/tabela` | GET | Tabela paginada | Dados + paginação |
| `/api/vinculos/filtros` | GET | Valores únicos | Listas para dropdowns |

**Tabelas acessadas:** `censo.vinculos`

**Queries executadas em /agregados:**
1. Tipo de Operação (COUNT GROUP BY)
2. Operação × CNES (COUNT GROUP BY, GROUP BY)
3. Sexo (COUNT GROUP BY)
4. Raça/Cor (COUNT GROUP BY WHERE NOT NULL)
5. Identidade de Gênero (COUNT GROUP BY WHERE NOT NULL)
6. Escolaridade (COUNT GROUP BY WHERE NOT NULL)
7. Área de Formação - CINE Top 15 (COUNT GROUP BY ORDER BY LIMIT)
8. CBO Top 20 (COUNT GROUP BY ORDER BY LIMIT)
9. Tipo de Vinculação Top 15 (COUNT GROUP BY ORDER BY LIMIT)
10. Carga Horária em Faixas (COUNT GROUP BY CASE)
11. Expectativa Profissional (COUNT GROUP BY WHERE NOT NULL)

---

### Painel de Resolução

| Endpoint | Método | Descrição | Dados Retornados |
|----------|--------|-----------|------------------|
| `/api/resolucao/dados` | GET | Resolução por competência | Séries históricas |

**Tabelas acessadas:** `censo.espelho_cnes`

## 🚦 Middleware Stack

```
Requisição HTTP
    ↓
1. CORS Middleware          ← Permite requisições cross-origin
    ↓
2. JSON Parser              ← Interpreta body JSON
    ↓
3. Logger Middleware        ← Log de todas as requisições
    ↓
4. Roteador Express         ← Encontra endpoint correto
    ↓
5. Handler da Rota          ← Executa lógica específica
    ↓
6. Resposta JSON
```

## 🔐 Segurança (Produção)

### Camadas Recomendadas

```
Internet
    ↓
┌─────────────────┐
│  Firewall       │  Porta 443 (HTTPS) aberta
└────────┬────────┘
         ↓
┌─────────────────┐
│  Nginx/Apache   │  Reverse Proxy + SSL
│  (Proxy)        │  - Rate limiting
│                 │  - Compressão gzip
│                 │  - Cache de assets
└────────┬────────┘
         ↓
┌─────────────────┐
│  API Express    │  localhost:3000
│  (Aplicação)    │  - CORS configurado
│                 │  - Validação de inputs
└────────┬────────┘
         ↓
┌─────────────────┐
│  PostgreSQL     │  Acesso via IP interno
│  (Banco)        │  - SSL obrigatório
│                 │  - Usuário com permissões mínimas
└─────────────────┘
```

### Configuração Nginx Recomendada

```nginx
# /etc/nginx/sites-available/fiocruz-api

upstream fiocruz_api {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name api.fiocruz.exemplo.com;
    
    # Redirecionar para HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.fiocruz.exemplo.com;
    
    # Certificados SSL (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/api.fiocruz.exemplo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.fiocruz.exemplo.com/privkey.pem;
    
    # Headers de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req zone=api_limit burst=20 nodelay;
    
    # Proxy para API
    location / {
        proxy_pass http://fiocruz_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Logs
    access_log /var/log/nginx/fiocruz-api-access.log;
    error_log /var/log/nginx/fiocruz-api-error.log;
}
```

## ⚡ Performance

### Otimizações Implementadas

1. **Pool de Conexões**
   - Reutiliza conexões
   - Limita conexões simultâneas
   - Fecha conexões ociosas

2. **Queries em Paralelo**
   - `Promise.all()` para agregados
   - Múltiplas queries executam simultaneamente
   - Reduz tempo total de resposta

3. **Paginação**
   - Limita dados retornados
   - OFFSET/LIMIT no banco
   - Reduz tráfego de rede

4. **Índices Recomendados** (adicionar no PostgreSQL):

```sql
-- Painel de Estabelecimentos
CREATE INDEX idx_recenseamento_uf ON censo.recenseamento(co_uf);
CREATE INDEX idx_recenseamento_situacao ON censo.recenseamento(ds_situacao);

-- Painel de Vínculos
CREATE INDEX idx_vinculos_cpf ON censo.vinculos(nu_cpf);
CREATE INDEX idx_vinculos_operacao ON censo.vinculos(no_tipo_operacao_censo);
CREATE INDEX idx_vinculos_sexo ON censo.vinculos(co_sexo);
CREATE INDEX idx_vinculos_cnes ON censo.vinculos(co_cnes);
CREATE INDEX idx_vinculos_cbo ON censo.vinculos(ds_ocupacao_cbo);

-- Painel de Resolução
CREATE INDEX idx_espelho_competencia ON censo.espelho_cnes(co_competencia);
CREATE INDEX idx_espelho_resolvido ON censo.espelho_cnes(st_resolvido);
CREATE INDEX idx_espelho_tipo ON censo.espelho_cnes(tipo_divergencia);
```

## 📈 Escalabilidade

### Vertical (Aumentar recursos do servidor)
- CPU: 4+ cores
- RAM: 8GB+
- SSD para I/O rápido

### Horizontal (Múltiplas instâncias)

```
Load Balancer (Nginx)
    ├─→ Instância 1 (PM2)
    ├─→ Instância 2 (PM2)
    └─→ Instância 3 (PM2)
            ↓
    PostgreSQL (Master)
    ├─→ Read Replica 1
    └─→ Read Replica 2
```

## 🔍 Monitoramento

### Logs Importantes

```bash
# PM2 logs
pm2 logs fiocruz-api

# Nginx access log
tail -f /var/log/nginx/fiocruz-api-access.log

# Nginx error log
tail -f /var/log/nginx/fiocruz-api-error.log

# PostgreSQL logs
tail -f /var/log/postgresql/postgresql-*.log
```

### Métricas para Monitorar

- **API:**
  - Taxa de requisições (req/s)
  - Tempo de resposta médio
  - Taxa de erro (4xx/5xx)
  - Uso de memória/CPU

- **Banco:**
  - Conexões ativas
  - Slow queries
  - Cache hit ratio
  - Locks/deadlocks

- **Sistema:**
  - CPU load
  - Memória livre
  - Disco I/O
  - Rede (bandwidth)

## 📞 Troubleshooting

### Problema: API lenta

**Verificar:**
1. Slow queries no PostgreSQL
2. Falta de índices
3. Pool de conexões saturado
4. CPU/memória do servidor

**Solução:**
- Adicionar índices
- Aumentar `max` do pool
- Otimizar queries
- Escalar servidor

---

### Problema: Erro de conexão

**Verificar:**
1. PostgreSQL está rodando?
2. Firewall liberado?
3. Credenciais corretas?
4. Limite de conexões atingido?

**Solução:**
- Reiniciar PostgreSQL
- Configurar firewall
- Verificar `.env`
- Aumentar `max_connections`

---

### Problema: CORS bloqueado

**Verificar:**
1. Origem da requisição
2. Configuração CORS na API

**Solução:**
```javascript
// Em server.js, configurar CORS específico:
app.use(cors({
  origin: ['https://seu-dominio.com', 'http://localhost:8080']
}));
```

---

**Documentação completa:** README.md  
**Instalação rápida:** GUIA-RAPIDO.md
