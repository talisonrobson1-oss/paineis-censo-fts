# API REST - FioCruz Painéis de Monitoramento

API REST em Node.js + Express para fornecer dados dos painéis de monitoramento do projeto de recenseamento FioCruz.

## 📋 Pré-requisitos

- Node.js 16+ instalado
- Acesso ao banco de dados PostgreSQL
- NPM ou Yarn

## 🚀 Instalação

### 1. Copiar os arquivos para o servidor

Copie os seguintes arquivos para uma pasta no seu servidor:
```
fiocruz-api/
├── server.js
├── package.json
├── .env.example
└── inspect-database.js
```

### 2. Instalar dependências

```bash
cd fiocruz-api
npm install
```

### 3. Configurar variáveis de ambiente

Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```

Edite o arquivo `.env` se necessário (as credenciais já estão configuradas).

### 4. (Opcional) Inspecionar o banco de dados

Execute o script de inspeção para ver a estrutura das tabelas:
```bash
npm run inspect
```

Isto ajudará a confirmar se os nomes das colunas estão corretos.

### 5. Iniciar o servidor

```bash
npm start
```

Para desenvolvimento com auto-reload:
```bash
npm run dev
```

## 📡 Endpoints Disponíveis

### Sistema

#### `GET /health`
Health check da API
```bash
curl http://localhost:3000/health
```

#### `GET /`
Documentação dos endpoints
```bash
curl http://localhost:3000/
```

---

### Painel de Estabelecimentos

#### `GET /api/estabelecimentos/stats`
Retorna estatísticas gerais dos estabelecimentos

**Resposta:**
```json
{
  "total_estabelecimentos": 1250,
  "total_ufs": 2,
  "total_situacoes": 5,
  "recenseados": 800,
  "pendentes": 450
}
```

#### `GET /api/estabelecimentos/por-situacao`
Retorna contagem de estabelecimentos por situação

**Resposta:**
```json
[
  {
    "situacao": "Recenseado",
    "quantidade": 800,
    "percentual": 64.0
  },
  {
    "situacao": "Pendente",
    "quantidade": 450,
    "percentual": 36.0
  }
]
```

#### `GET /api/estabelecimentos/por-uf`
Retorna contagem de estabelecimentos por UF

**Resposta:**
```json
[
  { "uf": "DF", "quantidade": 650 },
  { "uf": "MS", "quantidade": 600 }
]
```

---

### Painel de Vínculos

#### `GET /api/vinculos/stats`
Retorna estatísticas gerais dos vínculos

**Resposta:**
```json
{
  "total_vinculos": 35215,
  "total_profissionais": 28450,
  "total_cnes": 1250,
  "media_carga_horaria": 32.5,
  "inclusoes": 23956,
  "alteracoes": 4933,
  "exclusoes": 6326,
  "igual_cnes": 15000,
  "diverge_cnes": 20215
}
```

#### `GET /api/vinculos/agregados`
Retorna dados agregados para todos os gráficos do painel

**Resposta:**
```json
{
  "op": {
    "Inclusão": 23956,
    "Alteração": 4933,
    "Exclusão": 6326
  },
  "op_cnes": [
    { "no_tipo_operacao_censo": "Inclusão", "st_cnes": "S", "n": 12000 },
    { "no_tipo_operacao_censo": "Inclusão", "st_cnes": "N", "n": 11956 }
  ],
  "sexo": {
    "M": 15000,
    "F": 20000,
    "I": 215
  },
  "raca": { ... },
  "identidade_genero": { ... },
  "escolaridade": { ... },
  "cine": { ... },
  "cbo": { ... },
  "vinculacao": { ... },
  "ch_faixa": {
    "0h": 500,
    "1-10h": 1200,
    "11-20h": 3500,
    ...
  },
  "expectativa": { ... }
}
```

#### `GET /api/vinculos/tabela`
Retorna dados da tabela de vínculos com paginação e filtros

**Parâmetros de Query:**
- `page` (número): Página atual (padrão: 1)
- `limit` (número): Registros por página (padrão: 30)
- `operacao` (string): Filtrar por tipo de operação
- `cnes_status` (string): Filtrar por status CNES (S/N)
- `sexo` (string): Filtrar por sexo
- `escolaridade` (string): Filtrar por escolaridade
- `raca` (string): Filtrar por raça/cor
- `cine` (string): Buscar em área de formação (LIKE)
- `cbo` (string): Buscar em CBO (LIKE)
- `vinculo` (string): Buscar em tipo de vinculação (LIKE)

**Exemplo:**
```bash
curl "http://localhost:3000/api/vinculos/tabela?page=1&limit=30&operacao=Inclusão&sexo=F"
```

**Resposta:**
```json
{
  "data": [
    {
      "cpf_ultimos_4": "1234",
      "nu_cpf": "12345678901",
      "co_sexo": "F",
      "ds_ocupacao_cbo": "Enfermeiro",
      "ds_tipo_vinculacao": "Celetista",
      "qt_carga_horaria_total": 40,
      "qt_remuneracao_total": 5000.00,
      "no_tipo_operacao_censo": "Inclusão",
      "co_cnes": "1234567",
      "st_cnes": "S",
      "ds_escolaridade": "Superior Completo",
      "ds_raca_cor": "Parda",
      "ds_area_formacao_cine": "Enfermagem"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 30,
    "total": 23956,
    "pages": 799
  }
}
```

#### `GET /api/vinculos/filtros`
Retorna valores únicos para popular os filtros do painel

**Resposta:**
```json
{
  "escolaridade": [
    "Ensino Fundamental",
    "Ensino Médio",
    "Superior Completo",
    "Pós-graduação"
  ],
  "raca": [
    "Branca",
    "Preta",
    "Parda",
    "Amarela",
    "Indígena"
  ],
  "cine": [
    "Enfermagem",
    "Medicina",
    "Fisioterapia",
    ...
  ]
}
```

---

### Painel de Resolução

#### `GET /api/resolucao/dados`
Retorna dados de resolução de divergências por competência

**Resposta:**
```json
{
  "comps": ["202508", "202509", "202510", "202511"],
  "comp_labels": {
    "202508": "Ago/2025",
    "202509": "Set/2025",
    "202510": "Out/2025",
    "202511": "Nov/2025"
  },
  "results": {
    "202508": {
      "inclusao": {
        "total": 23956,
        "resolvidas": 1890,
        "pendentes": 22066,
        "pct": 7.9
      },
      "alteracao": { ... },
      "exclusao": { ... },
      "total": { ... }
    },
    "202509": { ... },
    "202510": { ... },
    "202511": { ... }
  },
  "base_comp": "Abril/2025",
  "totals_base": {
    "inclusao": 23956,
    "alteracao": 4933,
    "exclusao": 6326,
    "total": 35215
  }
}
```

## 🔧 Ajustes Necessários

### ⚠️ IMPORTANTE: Verificar Nomes das Colunas

As queries na API assumem os seguintes nomes de colunas. **Você precisa verificar** se correspondem à estrutura real do seu banco:

**Tabela `censo.recenseamento`:**
- `co_uf`
- `ds_situacao`

**Tabela `censo.vinculos`:**
- `nu_cpf`
- `co_sexo`
- `ds_ocupacao_cbo`
- `ds_tipo_vinculacao`
- `qt_carga_horaria_total`
- `qt_remuneracao_total`
- `no_tipo_operacao_censo`
- `co_cnes`
- `st_cnes`
- `ds_escolaridade`
- `ds_raca_cor`
- `ds_area_formacao_cine`
- `ds_identidade_genero`
- `ds_expectativa_profissional`

**Tabela `censo.espelho_cnes`:**
- `co_competencia`
- `st_resolvido`
- `tipo_divergencia`

### 📝 Como Verificar

1. Execute o script de inspeção:
```bash
npm run inspect
```

2. Compare os nomes das colunas retornados com os usados nas queries

3. Ajuste as queries em `server.js` se necessário

## 🌐 Deploy em Produção

### Opção 1: PM2 (Recomendado)

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar aplicação
pm2 start server.js --name fiocruz-api

# Configurar para iniciar no boot
pm2 startup
pm2 save

# Ver logs
pm2 logs fiocruz-api

# Parar
pm2 stop fiocruz-api

# Reiniciar
pm2 restart fiocruz-api
```

### Opção 2: Docker

Criar `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Build e run:
```bash
docker build -t fiocruz-api .
docker run -p 3000:3000 --env-file .env fiocruz-api
```

### Opção 3: Systemd Service

Criar `/etc/systemd/system/fiocruz-api.service`:
```ini
[Unit]
Description=FioCruz API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/fiocruz-api
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Ativar:
```bash
sudo systemctl enable fiocruz-api
sudo systemctl start fiocruz-api
sudo systemctl status fiocruz-api
```

## 🔒 Segurança em Produção

1. **Use HTTPS**: Configure um proxy reverso (Nginx/Apache) com certificado SSL
2. **Rate Limiting**: Adicione limitação de taxa para evitar abuso
3. **Autenticação**: Considere adicionar autenticação via JWT ou API Key
4. **CORS**: Configure CORS para permitir apenas seus domínios

Exemplo de configuração Nginx:
```nginx
server {
    listen 80;
    server_name api.fiocruz.exemplo.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📊 Monitoramento

Verificar status da API:
```bash
curl http://localhost:3000/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-04-01T17:00:00.000Z"
}
```

## 🐛 Troubleshooting

### Erro de conexão com banco
- Verifique se o IP do servidor está liberado no firewall do PostgreSQL
- Confirme as credenciais no arquivo `.env`
- Teste a conexão com `psql`:
```bash
psql -h 177.85.162.132 -p 54329 -U usr_censo -d db_dataware
```

### Porta 3000 já em uso
Altere a porta no arquivo `.env`:
```
PORT=3001
```

### Erros de sintaxe SQL
Execute o script de inspeção e ajuste os nomes das colunas nas queries

## 📞 Suporte

Para dúvidas ou problemas, verifique:
1. Logs da aplicação
2. Status do banco de dados
3. Configurações de firewall e rede

## 📝 Licença

ISC
