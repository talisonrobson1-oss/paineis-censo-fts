# 🚀 GUIA RÁPIDO DE INSTALAÇÃO - API FioCruz

## ⚡ Instalação em 5 Minutos

### 1️⃣ Enviar arquivos para o servidor
```bash
# Copie a pasta api-fiocruz para seu servidor
scp -r api-fiocruz usuario@seu-servidor:/var/www/
```

### 2️⃣ Acessar a pasta
```bash
cd /var/www/api-fiocruz
```

### 3️⃣ Instalar dependências
```bash
npm install
```

### 4️⃣ Configurar ambiente
```bash
cp .env.example .env
# Edite .env se necessário (credenciais já estão configuradas)
```

### 5️⃣ Iniciar servidor
```bash
npm start
```

✅ **API rodando em:** `http://localhost:3000`

---

## 🔍 Verificar se está funcionando

### Teste rápido:
```bash
curl http://localhost:3000/health
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-04-01T17:00:00.000Z"
}
```

### Testar todos os endpoints:
```bash
bash test-api.sh
```

---

## ⚠️ IMPORTANTE: Verificar Nomes das Colunas

**Antes de usar em produção**, execute o script de inspeção:

```bash
npm run inspect
```

Este script mostrará a estrutura real das tabelas. Compare com os nomes usados nas queries e ajuste `server.js` se necessário.

---

## 🌐 Produção com PM2

### Instalar PM2:
```bash
npm install -g pm2
```

### Iniciar em produção:
```bash
pm2 start server.js --name fiocruz-api
pm2 save
pm2 startup
```

### Gerenciar:
```bash
pm2 status         # Ver status
pm2 logs fiocruz-api   # Ver logs
pm2 restart fiocruz-api  # Reiniciar
pm2 stop fiocruz-api     # Parar
```

---

## 📡 Endpoints Principais

### Sistema
- `GET /health` - Health check
- `GET /` - Documentação

### Estabelecimentos
- `GET /api/estabelecimentos/stats`
- `GET /api/estabelecimentos/por-situacao`
- `GET /api/estabelecimentos/por-uf`

### Vínculos
- `GET /api/vinculos/stats`
- `GET /api/vinculos/agregados`
- `GET /api/vinculos/tabela?page=1&limit=30`
- `GET /api/vinculos/filtros`

### Resolução
- `GET /api/resolucao/dados`

---

## 🔧 Solução de Problemas

### Porta 3000 já em uso?
```bash
# Edite o arquivo .env e mude a porta:
PORT=3001
```

### Erro de conexão com banco?
```bash
# Teste a conexão diretamente:
psql -h 177.85.162.132 -p 54329 -U usr_censo -d db_dataware
```

### Ver logs em tempo real:
```bash
pm2 logs fiocruz-api --lines 100
```

---

## 📞 Próximos Passos

Após a API estar funcionando:

1. **Teste todos os endpoints** com `bash test-api.sh`
2. **Verifique os nomes das colunas** com `npm run inspect`
3. **Ajuste as queries** em `server.js` se necessário
4. **Configure CORS** se necessário (no arquivo .env)
5. **Configure proxy reverso** (Nginx/Apache) com HTTPS
6. **Modifique os painéis HTML** para consumir a API

---

## 📝 Checklist de Instalação

- [ ] Arquivos enviados para o servidor
- [ ] Dependências instaladas (`npm install`)
- [ ] Arquivo `.env` configurado
- [ ] Servidor iniciado (`npm start`)
- [ ] Health check funcionando
- [ ] Script de inspeção executado
- [ ] Nomes das colunas verificados e ajustados
- [ ] PM2 configurado (produção)
- [ ] HTTPS configurado (produção)
- [ ] Painéis HTML atualizados

---

Para documentação completa, veja **README.md**
