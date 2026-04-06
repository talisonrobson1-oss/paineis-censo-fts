#!/usr/bin/env python3
"""
Script para modificar automaticamente os 3 painéis HTML
para consumirem dados da API

Uso:
    python modificar-paineis.py
"""

import re
import os

def ler_arquivo(caminho):
    with open(caminho, 'r', encoding='utf-8') as f:
        return f.read()

def salvar_arquivo(caminho, conteudo):
    with open(caminho, 'w', encoding='utf-8') as f:
        f.write(conteudo)

def adicionar_script_config(html):
    """Adiciona referência ao api-config.js no <head>"""
    if 'api-config.js' in html:
        return html
    
    # Adicionar antes de </head>
    html = html.replace(
        '</head>',
        '<script src="api-config.js"></script>\n</head>'
    )
    return html

def adicionar_css_loading(html):
    """Adiciona CSS para loading state"""
    css_loading = '''
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
  padding:32px;
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
  color:var(--text);
  margin-bottom:16px;
  line-height:1.6;
}
.error-details{
  font-size:11px;
  color:var(--muted);
  background:var(--surface2);
  padding:12px;
  border-radius:6px;
  margin-bottom:20px;
  font-family:'JetBrains Mono',monospace;
}
.error-actions{
  display:flex;
  gap:12px;
  justify-content:center;
  flex-wrap:wrap;
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
  border-color:#2596c9;
}
'''
    
    # Adicionar antes de </style>
    if 'loading-overlay' not in html:
        html = html.replace('</style>', css_loading + '\n</style>')
    
    return html

def adicionar_html_loading(html):
    """Adiciona HTML do loading overlay"""
    loading_html = '''
<!-- Loading Overlay -->
<div class="loading-overlay" id="loading-overlay">
  <div class="spinner"></div>
  <div class="loading-text">Carregando dados da API...</div>
</div>

'''
    
    # Adicionar logo após <body>
    if 'loading-overlay' not in html:
        html = html.replace('<body>', '<body>\n' + loading_html)
    
    return html

def remover_dados_embutidos(html):
    """Remove dados embutidos (variável D hardcoded)"""
    # Procurar por const D = {...} e remover
    # Padrão: const D = { ... muito conteúdo ... };
    
    # Para o painel de vínculos e estabelecimentos
    pattern = r'const D\s*=\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\};'
    html = re.sub(pattern, '// Dados removidos - agora vêm da API\nlet D = null;', html, flags=re.DOTALL)
    
    return html

def modificar_painel_vinculos(caminho_entrada, caminho_saida):
    """Modifica o painel de vínculos"""
    print(f"Modificando painel de vínculos: {caminho_entrada}")
    
    html = ler_arquivo(caminho_entrada)
    
    # Adicionar componentes
    html = adicionar_script_config(html)
    html = adicionar_css_loading(html)
    html = adicionar_html_loading(html)
    
    # Remover dados embutidos
    html = remover_dados_embutidos(html)
    
    # Substituir script JavaScript
    script_api = ler_arquivo('painel-vinculos-api-script.js')
    
    # Encontrar e substituir o conteúdo entre <script> e </script>
    # Procurar pelo último <script> (que contém o código principal)
    pattern = r'(<script>)(.*?)(</script>)'
    matches = list(re.finditer(pattern, html, re.DOTALL))
    
    if matches:
        # Pegar o último match (script principal)
        last_match = matches[-1]
        html = html[:last_match.start(2)] + '\n' + script_api + '\n' + html[last_match.end(2):]
    
    salvar_arquivo(caminho_saida, html)
    print(f"✅ Painel de vínculos modificado: {caminho_saida}")

def modificar_painel_estabelecimentos(caminho_entrada, caminho_saida):
    """Modifica o painel de estabelecimentos"""
    print(f"Modificando painel de estabelecimentos: {caminho_entrada}")
    
    html = ler_arquivo(caminho_entrada)
    
    # Adicionar componentes
    html = adicionar_script_config(html)
    html = adicionar_css_loading(html)
    html = adicionar_html_loading(html)
    
    # Remover dados embutidos
    html = remover_dados_embutidos(html)
    
    # TODO: Adicionar script específico para estabelecimentos
    
    salvar_arquivo(caminho_saida, html)
    print(f"✅ Painel de estabelecimentos modificado: {caminho_saida}")

def modificar_painel_resolucao(caminho_entrada, caminho_saida):
    """Modifica o painel de resolução"""
    print(f"Modificando painel de resolução: {caminho_entrada}")
    
    html = ler_arquivo(caminho_entrada)
    
    # Adicionar componentes
    html = adicionar_script_config(html)
    html = adicionar_css_loading(html)
    html = adicionar_html_loading(html)
    
    # Remover dados embutidos
    html = remover_dados_embutidos(html)
    
    # TODO: Adicionar script específico para resolução
    
    salvar_arquivo(caminho_saida, html)
    print(f"✅ Painel de resolução modificado: {caminho_saida}")

def main():
    print("=" * 60)
    print("MODIFICAÇÃO AUTOMÁTICA DOS PAINÉIS")
    print("=" * 60)
    print()
    
    # Verificar se arquivos existem
    arquivos = {
        'vinculos': 'painel_vinculos_reorganizado.html',
        'estabelecimentos': 'painel_fiocruz_reorganizado.html',
        'resolucao': 'painel_resolucao.html'
    }
    
    for nome, arquivo in arquivos.items():
        if not os.path.exists(arquivo):
            print(f"❌ Arquivo não encontrado: {arquivo}")
            print(f"   Certifique-se de executar este script na pasta dos painéis")
            return
    
    # Modificar painéis
    modificar_painel_vinculos(
        arquivos['vinculos'],
        'painel_vinculos_API.html'
    )
    
    modificar_painel_estabelecimentos(
        arquivos['estabelecimentos'],
        'painel_estabelecimentos_API.html'
    )
    
    modificar_painel_resolucao(
        arquivos['resolucao'],
        'painel_resolucao_API.html'
    )
    
    print()
    print("=" * 60)
    print("✅ MODIFICAÇÃO CONCLUÍDA!")
    print("=" * 60)
    print()
    print("Arquivos gerados:")
    print("  - painel_vinculos_API.html")
    print("  - painel_estabelecimentos_API.html")
    print("  - painel_resolucao_API.html")
    print()
    print("Próximos passos:")
    print("1. Certifique-se que api-config.js está na mesma pasta")
    print("2. Inicie a API: npm start")
    print("3. Abra os painéis no navegador")
    print()

if __name__ == '__main__':
    main()
