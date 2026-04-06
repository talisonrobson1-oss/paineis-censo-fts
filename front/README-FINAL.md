# 🎯 PAINÉIS COM API - INSTRUÇÕES FINAIS

## 📦 Arquivos Criados

Você recebeu os seguintes arquivos:

### **Arquivos de Configuração:**
1. `api-config.js` - Configuração da API
2. `LOADING-COMPONENTS.html` - Componentes de loading/erro

### **Scripts JavaScript:**
3. `painel-vinculos-api-script.js` - Script completo para Painel de Vínculos

### **Guias e Documentação:**
4. `GUIA-MODIFICACAO-PAINEIS.md` - Guia passo a passo manual
5. `modificar-paineis.py` - Script Python para automação (opcional)

---

## 🚀 OPÇÃO 1: Modificação Manual Rápida (RECOMENDADO)

### **Para o Painel de Vínculos:**

#### **Passo 1: Adicionar api-config.js**
No arquivo `painel_vinculos_reorganizado.html`, adicione antes de `</head>`:
```html
<script src="api-config.js"></script>
</head>
```

#### **Passo 2: Adicionar CSS de Loading**
Abra `LOADING-COMPONENTS.html`, copie TODO o CSS e cole no `<style>` antes de `</style>`.

#### **Passo 3: Adicionar HTML de Loading**
Copie o HTML do loading overlay e cole logo após `<body>`:
```html
<body>
<!-- Loading Overlay -->
<div class="loading-overlay" id="loading-overlay">
  <div class="spinner"></div>
  <div class="loading-text">Carregando dados da API...</div>
</div>

<!-- Restante do conteúdo... -->
```

#### **Passo 4: Substituir JavaScript**
1. Abra `painel_vinculos_reorganizado.html`
2. Localize a tag `<script>` (geralmente linha ~400)
3. **DELETE** todo o conteúdo entre `<script>` e `</script>`
4. Abra `painel-vinculos-api-script.js`
5. **COPIE** todo o conteúdo
6. **COLE** entre `<script>` e `</script>`

#### **Passo 5: Testar**
1. Certifique-se que `api-config.js` está na mesma pasta do painel
2. Inicie a API: `npm start`
3. Abra `painel_vinculos_reorganizado.html` no navegador
4. Deve aparecer um loading e depois os dados!

---

## 🚀 OPÇÃO 2: Usar Script Python (Automático)

### **Requisitos:**
- Python 3.6+ instalado

### **Passos:**

1. **Colocar arquivos na mesma pasta:**
   ```
   pasta-paineis/
   ├── painel_vinculos_reorganizado.html
   ├── painel_fiocruz_reorganizado.html
   ├── painel_resolucao.html
   ├── api-config.js
   ├── painel-vinculos-api-script.js
   └── modificar-paineis.py
   ```

2. **Executar o script:**
   ```bash
   python modificar-paineis.py
   ```

3. **Resultado:**
   Serão criados 3 novos arquivos:
   - `painel_vinculos_API.html`
   - `painel_estabelecimentos_API.html`
   - `painel_resolucao_API.html`

---

## ⚙️ Configuração da API

### **URL Local (Padrão):**
Em `api-config.js`:
```javascript
BASE_URL: 'http://localhost:3000',
```

### **URL de Produção:**
Quando fizer deploy da API, altere para:
```javascript
BASE_URL: 'https://sua-api-producao.com',
```

---

## 🧪 Testando

### **1. Iniciar a API:**
```bash
cd fiocruz-api
npm start
```

Deve aparecer:
```
✅ Conectado ao banco de dados PostgreSQL
🚀 Servidor rodando na porta 3000
```

### **2. Verificar API:**
Abra no navegador:
- http://localhost:3000/health

Deve retornar:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-04-01..."
}
```

### **3. Abrir Painéis:**
Abra os painéis no navegador. Você deve ver:
1. ⏳ Loading spinner ("Carregando dados da API...")
2. ✅ Painel carregado com dados
3. 📊 Gráficos renderizados

### **4. Verificar Console (F12):**
Deve mostrar:
```
[API] Requisição: /api/vinculos/stats
[API] Sucesso: /api/vinculos/stats
[API] Requisição: /api/vinculos/agregados
[API] Sucesso: /api/vinculos/agregados
...
✅ Painel de vínculos carregado com sucesso
```

---

## 🔧 Troubleshooting

### **❌ Erro: "API não está respondendo"**

**Causa:** API não está rodando ou URL errada

**Solução:**
1. Verificar se `npm start` está rodando
2. Verificar URL em `api-config.js`
3. Testar: http://localhost:3000/health

---

### **❌ Erro: "Failed to fetch"**

**Causa:** CORS ou API offline

**Solução:**
1. Verificar se API tem `cors()` no server.js (já tem)
2. Verificar firewall/antivírus
3. Testar API diretamente no navegador

---

### **❌ Dados não aparecem**

**Causa:** Estrutura de dados diferente

**Solução:**
1. Abrir console do navegador (F12)
2. Ver aba "Network" para ver requisições
3. Verificar resposta da API
4. Comparar com formato esperado

---

### **❌ Loading infinito**

**Causa:** Erro JavaScript ou API travada

**Solução:**
1. Abrir console (F12)
2. Ver erros em vermelho
3. Verificar logs da API no terminal

---

## 📝 Checklist Final

Antes de usar em produção:

- [ ] API rodando e testada
- [ ] `api-config.js` configurado
- [ ] Painéis modificados
- [ ] Loading components adicionados
- [ ] Testado em navegador local
- [ ] Console sem erros (F12)
- [ ] Todos os gráficos carregando
- [ ] Tabela paginando corretamente
- [ ] Filtros funcionando

---

## 🎨 Próximos Passos

1. ✅ **Painéis funcionando localmente**
2. 🚀 **Deploy da API** (Render/Railway/VPS)
3. 🔧 **Atualizar api-config.js** com URL de produção
4. 🌐 **Hospedar painéis** (GitHub Pages/Netlify/Vercel)
5. 🎯 **Testar em produção**

---

## 📞 Suporte

### **Problemas Comuns:**

**P: O painel não carrega**
R: Verifique se a API está rodando e acessível

**P: Erro de CORS**
R: API já tem CORS configurado, verifique se está usando a URL correta

**P: Dados não batem**
R: Limpe o cache do navegador (Ctrl+F5)

**P: Lento para carregar**
R: Normal na primeira vez, depois é rápido (cache)

---

## 🎯 Status Atual

### ✅ **Completado:**
- API REST funcionando
- Conexão com PostgreSQL
- Endpoints de vínculos
- Script JavaScript para painel de vínculos
- Componentes de loading/erro
- Documentação completa

### 🔄 **Pendente:**
- Scripts para painéis de estabelecimentos e resolução
- (Serão criados seguindo mesma lógica do painel de vínculos)

---

**Dúvidas?** Verifique:
1. `GUIA-MODIFICACAO-PAINEIS.md` - Guia detalhado
2. Console do navegador (F12)
3. Logs da API no terminal

**Boa sorte! 🚀**
