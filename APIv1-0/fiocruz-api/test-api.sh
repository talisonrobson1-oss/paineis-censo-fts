#!/bin/bash
# Script de Testes da API FioCruz
# Execut: bash test-api.sh

BASE_URL="http://localhost:3000"

echo "=========================================="
echo "TESTANDO API FIOCRUZ - PAINÉIS"
echo "=========================================="
echo ""

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}1. Health Check${NC}"
curl -s "$BASE_URL/health" | jq '.'
echo ""
echo ""

echo -e "${BLUE}2. Documentação da API${NC}"
curl -s "$BASE_URL/" | jq '.endpoints'
echo ""
echo ""

echo -e "${GREEN}=== PAINEL DE ESTABELECIMENTOS ===${NC}"
echo ""

echo -e "${BLUE}3. Stats de Estabelecimentos${NC}"
curl -s "$BASE_URL/api/estabelecimentos/stats" | jq '.'
echo ""
echo ""

echo -e "${BLUE}4. Estabelecimentos por Situação${NC}"
curl -s "$BASE_URL/api/estabelecimentos/por-situacao" | jq '.'
echo ""
echo ""

echo -e "${BLUE}5. Estabelecimentos por UF${NC}"
curl -s "$BASE_URL/api/estabelecimentos/por-uf" | jq '.'
echo ""
echo ""

echo -e "${GREEN}=== PAINEL DE VÍNCULOS ===${NC}"
echo ""

echo -e "${BLUE}6. Stats de Vínculos${NC}"
curl -s "$BASE_URL/api/vinculos/stats" | jq '.'
echo ""
echo ""

echo -e "${BLUE}7. Dados Agregados (primeiros 50 caracteres de cada chave)${NC}"
curl -s "$BASE_URL/api/vinculos/agregados" | jq 'to_entries | map({key: .key, sample: .value}) | from_entries'
echo ""
echo ""

echo -e "${BLUE}8. Filtros Disponíveis${NC}"
curl -s "$BASE_URL/api/vinculos/filtros" | jq '.'
echo ""
echo ""

echo -e "${BLUE}9. Tabela de Vínculos (página 1, 5 registros)${NC}"
curl -s "$BASE_URL/api/vinculos/tabela?page=1&limit=5" | jq '.pagination, .data[0]'
echo ""
echo ""

echo -e "${BLUE}10. Tabela Filtrada (Inclusões, Sexo F)${NC}"
curl -s "$BASE_URL/api/vinculos/tabela?page=1&limit=3&operacao=Inclusão&sexo=F" | jq '.pagination'
echo ""
echo ""

echo -e "${GREEN}=== PAINEL DE RESOLUÇÃO ===${NC}"
echo ""

echo -e "${BLUE}11. Dados de Resolução${NC}"
curl -s "$BASE_URL/api/resolucao/dados" | jq '.comps, .comp_labels, .totals_base'
echo ""
echo ""

echo -e "${GREEN}Testes concluídos!${NC}"
