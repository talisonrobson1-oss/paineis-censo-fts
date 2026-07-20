// gerar-catalogo.js — Catálogo de Entidades e Atributos CensoFTS
// Gera: Catalogo_Entidades_Atributos_CensoFTS.xlsx

const XLSX = require('./APIv1-0/fiocruz-api/node_modules/xlsx');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// DADOS
// ─────────────────────────────────────────────────────────────────────────────

const ENTIDADES = [
  // ─── 1. ESTABELECIMENTO DE SAÚDE ─────────────────────────────────────────
  {
    entidade: 'ESTABELECIMENTO DE SAÚDE',
    banco: 'DBCNES',
    tabela: 'TB_COMP_ESTABELECIMENTO (View)',
    atributo: 'CO_UNIDADE', tipo: 'VARCHAR2(31)', pk: 'PK/FK',
    descricao: 'Código identificador único da unidade no CNES'
  },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NU_COMP', tipo: 'VARCHAR2(6)', pk: 'PK', descricao: 'Competência de referência (AAAAMM)' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_CNES', tipo: 'VARCHAR2(7)', pk: '', descricao: 'Código CNES de 7 dígitos (com zeros à esquerda)' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NO_RAZAO_SOCIAL', tipo: 'VARCHAR2(60)', pk: '', descricao: 'Razão social do estabelecimento' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NO_FANTASIA', tipo: 'VARCHAR2(60)', pk: '', descricao: 'Nome fantasia do estabelecimento' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'TP_PFPJ', tipo: 'CHAR(1)', pk: '', descricao: 'Tipo: Pessoa Física (F) ou Jurídica (J)' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NO_LOGRADOURO', tipo: 'VARCHAR2(60)', pk: '', descricao: 'Logradouro do endereço' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NU_ENDERECO', tipo: 'VARCHAR2(10)', pk: '', descricao: 'Número do endereço' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NO_BAIRRO', tipo: 'VARCHAR2(40)', pk: '', descricao: 'Bairro' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_CEP', tipo: 'VARCHAR2(8)', pk: '', descricao: 'CEP' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_MUNICIPIO_GESTOR', tipo: 'VARCHAR2(7)', pk: '', descricao: 'Município gestor' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_ESTADO_GESTOR', tipo: 'CHAR(2)', pk: '', descricao: 'UF do estado gestor' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_REGIAO_SAUDE', tipo: 'VARCHAR2(4)', pk: '', descricao: 'Região de saúde' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_DISTRITO_SANITARIO', tipo: 'VARCHAR2(4)', pk: '', descricao: 'Distrito sanitário' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_DISTRITO_ADMINISTRATIVO', tipo: 'VARCHAR2(4)', pk: '', descricao: 'Distrito administrativo' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_MICRO_REGIAO', tipo: 'VARCHAR2(6)', pk: '', descricao: 'Microrregião' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_ESFERA_ADMINISTRATIVA', tipo: 'CHAR(2)', pk: '', descricao: 'Esfera administrativa (Federal / Estadual / Municipal / Privada)' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_NATUREZA_ORGANIZACAO', tipo: 'CHAR(2)', pk: '', descricao: 'Natureza da organização' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_NIVEL_HIERARQUIA', tipo: 'CHAR(2)', pk: '', descricao: 'Nível hierárquico na rede de saúde' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'TP_UNIDADE', tipo: 'CHAR(2)', pk: '', descricao: 'Tipo de unidade' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_TIPO_UNIDADE', tipo: 'CHAR(2)', pk: '', descricao: 'Código do tipo de unidade' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_ATIVIDADE', tipo: 'CHAR(2)', pk: '', descricao: 'Atividade principal' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_CLIENTELA', tipo: 'CHAR(2)', pk: '', descricao: 'Tipo de clientela atendida' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'TP_VINCULO_SUS', tipo: 'CHAR(1)', pk: '', descricao: 'Vínculo com o SUS (S/N)' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'ST_CONTRATO_SUS', tipo: 'CHAR(1)', pk: '', descricao: 'Contrato formalizado com o SUS' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_TURNO_ATENDIMENTO', tipo: 'CHAR(2)', pk: '', descricao: 'Turno de atendimento' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NU_TELEFONE', tipo: 'VARCHAR2(40)', pk: '', descricao: 'Telefone de contato' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NO_EMAIL', tipo: 'VARCHAR2(60)', pk: '', descricao: 'E-mail' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NU_CPF', tipo: 'VARCHAR2(11)', pk: '', descricao: 'CPF do responsável (PF)' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NU_CNPJ', tipo: 'VARCHAR2(14)', pk: '', descricao: 'CNPJ do estabelecimento' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NU_CNPJ_MANTENEDORA', tipo: 'VARCHAR2(14)', pk: '', descricao: 'CNPJ da entidade mantenedora' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NU_LATITUDE', tipo: 'NUMBER', pk: '', descricao: 'Latitude geográfica' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'NU_LONGITUDE', tipo: 'NUMBER', pk: '', descricao: 'Longitude geográfica' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_NIVEL_DEP', tipo: 'CHAR(1)', pk: '', descricao: 'Nível de dependência' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_ESTABELECIMENTO (View)', atributo: 'CO_SIASUS', tipo: 'VARCHAR2(7)', pk: '', descricao: 'Código SIASUS' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO_UNIDADE', atributo: 'CO_SITUACAO_CENSO_UNIDADE', tipo: 'NUMBER(2)', pk: '', descricao: 'Situação da unidade no recenseamento' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO_UNIDADE', atributo: 'CO_FORMA_CONTATO', tipo: 'NUMBER(2)', pk: 'FK', descricao: 'Forma de contato utilizada no censo (tabela de domínio)' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO_UNIDADE', atributo: 'DT_CONTATO', tipo: 'DATE', pk: '', descricao: 'Data do contato com a unidade' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO_UNIDADE', atributo: 'ST_CONFIRMADO', tipo: 'CHAR(1)', pk: '', descricao: 'Confirmação do contato (S/N)' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO_UNIDADE', atributo: 'DS_OBSERVACAO', tipo: 'VARCHAR2(2000)', pk: '', descricao: 'Observações sobre o contato' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO_UNIDADE', atributo: 'DT_ALTERACAO', tipo: 'DATE', pk: '', descricao: 'Data da última alteração do registro' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO_UNIDADE', atributo: 'ST_REGISTRO_ATIVO', tipo: 'CHAR(1)', pk: '', descricao: 'Registro ativo (S/N)' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO_UNIDADE', atributo: 'DS_ASSINATURA_JUSTIFICATIVA', tipo: 'CLOB', pk: '', descricao: 'Assinatura digital de justificativa de recusa (Base64)' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO_UNIDADE', atributo: 'CO_ARQUIVO_ANEXO_JUSTIFICATIVA', tipo: 'NUMBER(8)', pk: '', descricao: 'Referência ao arquivo de justificativa anexado' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO_UNIDADE', atributo: 'CO_USUARIO', tipo: 'NUMBER(8)', pk: '', descricao: 'Código do usuário responsável pelo registro' },
  { entidade: 'ESTABELECIMENTO DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO_UNIDADE', atributo: 'DT_INCLUSAO', tipo: 'DATE', pk: '', descricao: 'Data de inclusão do registro' },

  // ─── 2. PROFISSIONAL DE SAÚDE ─────────────────────────────────────────────
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'CO_PROFISSIONAL_SUS', tipo: 'VARCHAR2(16)', pk: 'PK', descricao: 'Código interno do profissional no CNES' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'NU_COMP', tipo: 'VARCHAR2(6)', pk: 'PK', descricao: 'Competência de referência (AAAAMM)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'CO_CPF', tipo: 'VARCHAR2(11)', pk: 'Idx', descricao: 'CPF do profissional' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'CO_CNS', tipo: 'VARCHAR2(15)', pk: 'Idx', descricao: 'Cartão Nacional de Saúde' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'NO_PROFISSIONAL', tipo: 'VARCHAR2(60)', pk: '', descricao: 'Nome completo do profissional' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'DT_NASCIMENTO', tipo: 'DATE', pk: '', descricao: 'Data de nascimento' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'TP_SEXO', tipo: 'CHAR(1)', pk: '', descricao: 'Sexo biológico (M/F)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'CO_RACA', tipo: 'CHAR(2)', pk: '', descricao: 'Raça/Cor (tabela de domínio CNES)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'CO_ETNIA', tipo: 'VARCHAR2(3)', pk: '', descricao: 'Etnia (para profissionais indígenas)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'CO_ESCOLARIDADE', tipo: 'CHAR(2)', pk: '', descricao: 'Nível de escolaridade' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'CO_MUNICIPIO', tipo: 'VARCHAR2(7)', pk: '', descricao: 'Município de atuação profissional' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'CO_SIGLA_ESTADO', tipo: 'CHAR(2)', pk: '', descricao: 'UF de atuação' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'CO_MUNICIPIO_RESIDENCIA', tipo: 'VARCHAR2(7)', pk: '', descricao: 'Município de residência' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'CO_SIGLA_ESTADO_RES', tipo: 'CHAR(2)', pk: '', descricao: 'UF de residência' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'TP_NACIONALIDADE', tipo: 'CHAR(1)', pk: '', descricao: 'Tipo de nacionalidade (B=Brasileiro / E=Estrangeiro)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'CO_PAIS', tipo: 'VARCHAR2(3)', pk: '', descricao: 'País de origem (estrangeiros)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'NO_EMAIL', tipo: 'VARCHAR2(80)', pk: '', descricao: 'E-mail do profissional' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'NU_TELEFONE', tipo: 'VARCHAR2(40)', pk: '', descricao: 'Telefone de contato' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBCNES', tabela: 'TB_COMP_DADOS_PROFISSIONAL_SUS', atributo: 'TP_SUS_NAO_SUS', tipo: 'CHAR(1)', pk: '', descricao: 'Indica se o profissional atua no SUS ou fora do SUS' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'NU_CPF', tipo: 'VARCHAR2(11)', pk: 'FK', descricao: 'CPF do profissional (chave de cruzamento com DBCNES)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'NU_CNS', tipo: 'CHAR(15)', pk: '', descricao: 'Cartão Nacional de Saúde informado no censo' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'CO_SEXO', tipo: 'CHAR(1)', pk: '', descricao: 'Sexo informado no censo' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'CO_RACA_COR', tipo: 'VARCHAR2(2)', pk: '', descricao: 'Raça/Cor informada no censo' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'CO_ESCOLARIDADE', tipo: 'VARCHAR2(2)', pk: '', descricao: 'Escolaridade informada no censo' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'CO_IDENTIDADE_GENERO', tipo: 'VARCHAR2(2)', pk: '', descricao: 'Identidade de gênero (coletado exclusivamente no censo)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'CO_GRUPO_DEFICIENCIA', tipo: 'NUMBER(2)', pk: '', descricao: 'Grupo de deficiência (coletado no censo)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'CO_CINE', tipo: 'VARCHAR2(7)', pk: '', descricao: 'Formação — Classificação Internacional Normalizada da Educação' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'DS_ESPECIALIDADE', tipo: 'VARCHAR2(200)', pk: '', descricao: 'Especialização / Residência Médica declarada' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'CO_EXPECTATIVA_PROFISSIONAL', tipo: 'NUMBER(2)', pk: '', descricao: 'Expectativa de permanência na profissão/área' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'CO_TIPO_OPERACAO_CENSO', tipo: 'NUMBER(1)', pk: '', descricao: 'Tipo de operação: 1=Inclusão / 2=Alteração / 3=Exclusão' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'ST_EXCLUSAO_CENSO', tipo: 'CHAR(1)', pk: '', descricao: 'Profissional marcado como excluído no censo (S/N)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'ST_TROCA_BASE', tipo: 'CHAR(1)', pk: '', descricao: 'Registro incluído por troca de base (S/N)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'DS_DIVERGENCIA', tipo: 'CLOB', pk: '', descricao: 'Descrição das divergências identificadas em relação ao CNES' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'NU_COMP_DIVERGENCIA_RESOLVIDA', tipo: 'VARCHAR2(6)', pk: '', descricao: 'Competência em que a divergência foi resolvida' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'DT_RESOLUCAO_DIVERGENCIA', tipo: 'DATE', pk: '', descricao: 'Data de resolução da divergência' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'QT_VINCULO_REMOVIDO', tipo: 'NUMBER(2)', pk: '', descricao: 'Quantidade de vínculos removidos no recenseamento' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'DT_ATUALIZACAO', tipo: 'DATE', pk: '', descricao: 'Data da última atualização do registro' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'ST_REGISTRO_ATIVO', tipo: 'CHAR(1)', pk: '', descricao: 'Registro ativo (S/N)' },
  { entidade: 'PROFISSIONAL DE SAÚDE', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_CENSO', atributo: 'DT_INCLUSAO', tipo: 'DATE', pk: '', descricao: 'Data de inclusão no sistema' },

  // ─── 3. VÍNCULO PROFISSIONAL ──────────────────────────────────────────────
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'CO_UNIDADE', tipo: 'VARCHAR2(31)', pk: 'PK/FK', descricao: 'Estabelecimento onde o vínculo é exercido' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'CO_PROFISSIONAL_SUS', tipo: 'VARCHAR2(16)', pk: 'PK/FK', descricao: 'Profissional titular do vínculo' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'CO_CBO', tipo: 'VARCHAR2(6)', pk: 'PK', descricao: 'Código Brasileiro de Ocupações da função exercida' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'IND_VINCULACAO', tipo: 'VARCHAR2(6)', pk: 'PK', descricao: 'Indicador do tipo de vinculação empregatícia' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'TP_SUS_NAO_SUS', tipo: 'CHAR(1)', pk: 'PK', descricao: 'Vínculo SUS (S) ou Não-SUS (N)' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'NU_COMP', tipo: 'VARCHAR2(6)', pk: 'PK', descricao: 'Competência do vínculo (AAAAMM)' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'QT_CARGA_HORARIA_AMBULATORIAL', tipo: 'NUMBER(3)', pk: '', descricao: 'Carga horária ambulatorial semanal' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'QT_CARGA_HOR_HOSP_SUS', tipo: 'NUMBER(4)', pk: '', descricao: 'Carga horária hospitalar SUS semanal' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'QT_CARGA_HORARIA_OUTROS', tipo: 'NUMBER(3)', pk: '', descricao: 'Carga horária em outras atividades semanal' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'NU_REGISTRO', tipo: 'VARCHAR2(13)', pk: '', descricao: 'Número de registro no conselho de classe' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'CO_CONSELHO_CLASSE', tipo: 'CHAR(2)', pk: '', descricao: 'Conselho de classe (CRM, COREN, CREFITO, etc.)' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'SG_UF_CRM', tipo: 'VARCHAR2(2)', pk: '', descricao: 'UF do registro no conselho de classe' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'TP_PRECEPTOR', tipo: 'CHAR(1)', pk: '', descricao: 'Indica se o profissional é preceptor (S/N)' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBCNES', tabela: 'TB_COMP_CARGA_HORARIA_SUS', atributo: 'TP_RESIDENTE', tipo: 'CHAR(1)', pk: '', descricao: 'Indica se o profissional é residente (S/N)' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'CO_CBO_OCUPACAO', tipo: 'VARCHAR2(6)', pk: '', descricao: 'CBO da ocupação recenseada' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'NU_VINCULACAO', tipo: 'VARCHAR2(6)', pk: '', descricao: 'Número/tipo do vínculo recenseado' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'ST_CNES', tipo: 'CHAR(1)', pk: '', descricao: 'Indica se o vínculo é proveniente do CNES (S/N)' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'QT_CARGA_HORARIA_TOTAL', tipo: 'NUMBER(3)', pk: '', descricao: 'Carga horária total semanal' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'QT_CARGA_HORARIA_AMBULATORIAL', tipo: 'NUMBER(3)', pk: '', descricao: 'Carga horária ambulatorial semanal' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'QT_CARGA_HORARIA_HOSPITALAR', tipo: 'NUMBER(3)', pk: '', descricao: 'Carga horária hospitalar semanal' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'QT_CARGA_HORARIA_OUTROS', tipo: 'NUMBER(3)', pk: '', descricao: 'Carga horária em outras atividades semanal' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'VL_REMUNERACAO', tipo: 'NUMBER(15,2)', pk: '', descricao: 'Remuneração declarada no vínculo' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'CO_TIPO_OPERACAO_CENSO', tipo: 'NUMBER(1)', pk: '', descricao: 'Tipo de operação no vínculo: 1=Inclusão / 2=Alteração / 3=Exclusão' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'NU_COMP_DIVERGENCIA_RESOLVIDA', tipo: 'VARCHAR2(6)', pk: '', descricao: 'Competência de resolução da divergência do vínculo' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'DT_RESOLUCAO_DIVERGENCIA', tipo: 'DATE', pk: '', descricao: 'Data de resolução da divergência do vínculo' },
  { entidade: 'VÍNCULO PROFISSIONAL', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_VINCULO_CENSO', atributo: 'ST_REGISTRO_ATIVO', tipo: 'CHAR(1)', pk: '', descricao: 'Registro ativo (S/N)' },

  // ─── 4. ESTRATÉGIA DO CENSO ───────────────────────────────────────────────
  { entidade: 'ESTRATÉGIA DO CENSO', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_ESTRATEGIA_CENSO', atributo: 'CO_SEQ_ESTRATEGIA_CENSO', tipo: 'NUMBER(8)', pk: 'PK', descricao: 'Chave primária da estratégia' },
  { entidade: 'ESTRATÉGIA DO CENSO', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_ESTRATEGIA_CENSO', atributo: 'CO_CENSO_UNIDADE', tipo: 'NUMBER(8)', pk: 'FK', descricao: 'Referência ao censo da unidade' },
  { entidade: 'ESTRATÉGIA DO CENSO', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_ESTRATEGIA_CENSO', atributo: 'CO_TIPO_ESTRATEGIA', tipo: 'NUMBER(2)', pk: '', descricao: 'Tipo de estratégia adotada para o recenseamento' },
  { entidade: 'ESTRATÉGIA DO CENSO', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_ESTRATEGIA_CENSO', atributo: 'CO_ARQUIVO_ANEXO', tipo: 'NUMBER(8)', pk: '', descricao: 'Arquivo de evidência/comprovante anexado' },
  { entidade: 'ESTRATÉGIA DO CENSO', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_ESTRATEGIA_CENSO', atributo: 'CO_USUARIO', tipo: 'NUMBER(8)', pk: '', descricao: 'Código do usuário que definiu a estratégia' },
  { entidade: 'ESTRATÉGIA DO CENSO', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_ESTRATEGIA_CENSO', atributo: 'DT_INCLUSAO', tipo: 'DATE', pk: '', descricao: 'Data de definição/inclusão da estratégia' },
  { entidade: 'ESTRATÉGIA DO CENSO', banco: 'DBSGTES', tabela: 'TB_CENSOCNES_ESTRATEGIA_CENSO', atributo: 'ST_REGISTRO_ATIVO', tipo: 'CHAR(1)', pk: '', descricao: 'Registro ativo (S/N)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER
// ─────────────────────────────────────────────────────────────────────────────

const wb = XLSX.utils.book_new();

// ─── ABA 1: Catálogo completo ─────────────────────────────────────────────
const header1 = ['Entidade', 'Banco de Dados', 'Tabela / Objeto', 'Atributo', 'Tipo de Dado', 'Chave', 'Descrição'];
const rows1 = ENTIDADES.map(r => [r.entidade, r.banco, r.tabela, r.atributo, r.tipo, r.pk, r.descricao]);
const ws1 = XLSX.utils.aoa_to_sheet([header1, ...rows1]);

// Larguras de coluna
ws1['!cols'] = [
  { wch: 28 }, // Entidade
  { wch: 12 }, // Banco
  { wch: 38 }, // Tabela
  { wch: 36 }, // Atributo
  { wch: 16 }, // Tipo
  { wch: 8  }, // Chave
  { wch: 70 }, // Descrição
];
XLSX.utils.book_append_sheet(wb, ws1, 'Catálogo Completo');

// ─── ABA 2: Por entidade — Estabelecimento ────────────────────────────────
const makeEntitySheet = (label) => {
  const data = ENTIDADES.filter(r => r.entidade === label);
  const rows = data.map(r => [r.banco, r.tabela, r.atributo, r.tipo, r.pk, r.descricao]);
  const ws = XLSX.utils.aoa_to_sheet([
    ['Banco de Dados', 'Tabela / Objeto', 'Atributo', 'Tipo de Dado', 'Chave', 'Descrição'],
    ...rows
  ]);
  ws['!cols'] = [{ wch: 12 }, { wch: 38 }, { wch: 36 }, { wch: 16 }, { wch: 8 }, { wch: 70 }];
  return ws;
};

XLSX.utils.book_append_sheet(wb, makeEntitySheet('ESTABELECIMENTO DE SAÚDE'),  'Estabelecimento');
XLSX.utils.book_append_sheet(wb, makeEntitySheet('PROFISSIONAL DE SAÚDE'),     'Profissional');
XLSX.utils.book_append_sheet(wb, makeEntitySheet('VÍNCULO PROFISSIONAL'),      'Vínculo');
XLSX.utils.book_append_sheet(wb, makeEntitySheet('ESTRATÉGIA DO CENSO'),       'Estratégia Censo');

// ─── ABA 5: Relacionamentos ────────────────────────────────────────────────
const relRows = [
  ['Tabela Origem', 'Atributo Origem', 'Tabela Destino', 'Atributo Destino', 'Descrição'],
  ['DBCNES.TB_COMP_ESTABELECIMENTO', 'CO_UNIDADE', 'DBSGTES.TB_CENSOCNES_CENSO_UNIDADE', 'CO_UNIDADE', 'Identificação do estabelecimento no censo'],
  ['DBSGTES.TB_CENSOCNES_CENSO_UNIDADE', 'CO_SEQ_CENSO_UNIDADE', 'DBSGTES.TB_CENSOCNES_ESTRATEGIA_CENSO', 'CO_CENSO_UNIDADE', 'Estratégia definida para o recenseamento da unidade'],
  ['DBSGTES.TB_CENSOCNES_ESTRATEGIA_CENSO', 'CO_SEQ_ESTRATEGIA_CENSO', 'DBSGTES.TB_CENSOCNES_CENSO', 'CO_ESTRATEGIA_CENSO', 'Profissional recenseado vinculado à estratégia'],
  ['DBSGTES.TB_CENSOCNES_CENSO', 'CO_SEQ_CENSO', 'DBSGTES.TB_CENSOCNES_VINCULO_CENSO', 'CO_CENSO', 'Vínculos do profissional registrados no censo'],
  ['DBCNES.TB_COMP_DADOS_PROFISSIONAL_SUS', 'CO_CPF', 'DBSGTES.TB_CENSOCNES_CENSO', 'NU_CPF', 'Cruzamento do profissional CNES com o recenseado'],
  ['DBCNES.TB_COMP_CARGA_HORARIA_SUS', 'CO_UNIDADE + CO_PROFISSIONAL_SUS', 'DBSGTES.TB_CENSOCNES_VINCULO_CENSO', 'CO_CBO_OCUPACAO + NU_VINCULACAO', 'Espelho do vínculo original no CNES vs. vínculo recenseado'],
];
const ws5 = XLSX.utils.aoa_to_sheet(relRows);
ws5['!cols'] = [{ wch: 38 }, { wch: 30 }, { wch: 38 }, { wch: 30 }, { wch: 55 }];
XLSX.utils.book_append_sheet(wb, ws5, 'Relacionamentos');

// ─────────────────────────────────────────────────────────────────────────────
// SALVAR
// ─────────────────────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, 'Catalogo_Entidades_Atributos_CensoFTS.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Arquivo gerado:', outPath);
