// diagnostico-gap-individuos.js
// Quantifica cada grupo de profissional para entender o gap entre
// Total de Profissionais Únicos e a soma (Admissões + Desligamentos + Alterações)

const { Pool } = require('./APIv1-0/fiocruz-api/node_modules/pg');

const CNES = process.argv[2] || '0010456';

const pool = new Pool({
  host: '177.85.162.132', port: 54329, database: 'db_dataware',
  user: 'usr_censo', password: 'bvSs0UKS0yUANTugBXuXQivnTE2f',
  ssl: false, connectionTimeoutMillis: 30000, query_timeout: 120000,
});

async function main() {
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  DIAGNÓSTICO DE PROFISSIONAIS — CNES: ${CNES}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);

  const { rows } = await pool.query(`
    WITH min_comp AS (SELECT MIN(nu_comp) AS nu_comp FROM censo.espelho_cnes_nova),
    espelho_min AS (
      SELECT DISTINCT LPAD(co_cpf::text, 11, '0') AS co_cpf
      FROM censo.espelho_cnes_nova
      WHERE nu_comp = (SELECT nu_comp FROM min_comp)
        AND co_cnes = $1
    ),
    ops_por_cpf AS (
      SELECT
        nu_cpf,
        MAX(nome) AS nome,
        BOOL_OR(no_tipo_operacao_censo = 'Inclusão')  AS tem_inclusao,
        BOOL_OR(no_tipo_operacao_censo = 'Alteração') AS tem_alteracao,
        BOOL_OR(no_tipo_operacao_censo = 'Exclusão')  AS tem_exclusao,
        BOOL_AND(no_tipo_operacao_censo = 'Exclusão') AS so_exclusao
      FROM censo.recenseados_nova
      WHERE co_cnes = $1
      GROUP BY nu_cpf
    ),
    classificados AS (
      SELECT
        o.nu_cpf,
        o.nome,
        o.tem_inclusao,
        o.tem_alteracao,
        o.tem_exclusao,
        o.so_exclusao,
        (e.co_cpf IS NOT NULL) AS no_espelho,
        CASE
          -- Admissão: tem Inclusão e NÃO está no espelho
          WHEN o.tem_inclusao AND e.co_cpf IS NULL
            THEN 'Admissão'
          -- Desligamento: só tem Exclusão e ESTÁ no espelho
          WHEN o.so_exclusao AND e.co_cpf IS NOT NULL
            THEN 'Desligamento'
          -- Alteração: tem Alteração e ESTÁ no espelho
          WHEN o.tem_alteracao AND e.co_cpf IS NOT NULL
            THEN 'Alteração de Vínculo'
          -- Casos não classificados:
          WHEN o.tem_inclusao AND e.co_cpf IS NOT NULL AND NOT o.tem_alteracao AND NOT o.so_exclusao
            THEN 'Inclusão com espelho (sem alteração)'
          WHEN o.tem_inclusao AND e.co_cpf IS NOT NULL AND o.tem_exclusao AND NOT o.tem_alteracao
            THEN 'Inclusão+Exclusão com espelho'
          WHEN o.so_exclusao AND e.co_cpf IS NULL
            THEN 'Exclusão sem espelho'
          WHEN o.tem_exclusao AND NOT o.so_exclusao AND e.co_cpf IS NULL
            THEN 'Misto (Incl+Excl) sem espelho'
          ELSE 'Outro (verificar)'
        END AS grupo
      FROM ops_por_cpf o
      LEFT JOIN espelho_min e ON e.co_cpf = o.nu_cpf::text
    )
    SELECT
      grupo,
      COUNT(*)                                          AS qtd,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct,
      -- exemplos de operações combinadas
      COUNT(*) FILTER (WHERE tem_inclusao AND NOT tem_alteracao AND NOT tem_exclusao)  AS so_inclusao,
      COUNT(*) FILTER (WHERE tem_alteracao AND NOT tem_inclusao AND NOT tem_exclusao)  AS so_alteracao,
      COUNT(*) FILTER (WHERE tem_exclusao AND NOT tem_inclusao AND NOT tem_alteracao)  AS so_exclusao_col,
      COUNT(*) FILTER (WHERE tem_inclusao AND tem_alteracao)                           AS incl_e_alt,
      COUNT(*) FILTER (WHERE tem_inclusao AND tem_exclusao AND NOT tem_alteracao)      AS incl_e_excl,
      COUNT(*) FILTER (WHERE tem_alteracao AND tem_exclusao)                           AS alt_e_excl
    FROM classificados
    GROUP BY grupo
    ORDER BY qtd DESC
  `, [CNES]);

  let total = 0;
  let totalClassificados = 0;

  console.log(`${'GRUPO'.padEnd(42)} ${'QTD'.padStart(7)}  ${'%'.padStart(5)}`);
  console.log('─'.repeat(58));

  const indicadores = ['Admissão', 'Desligamento', 'Alteração de Vínculo'];

  for (const r of rows) {
    const isIndicador = indicadores.includes(r.grupo);
    const marker = isIndicador ? '✅' : '⚠ ';
    console.log(`${marker} ${r.grupo.padEnd(40)} ${String(r.qtd).padStart(7)}  ${String(r.pct).padStart(5)}%`);
    total += parseInt(r.qtd);
    if (isIndicador) totalClassificados += parseInt(r.qtd);
  }

  console.log('─'.repeat(58));
  console.log(`   ${'TOTAL DE PROFISSIONAIS ÚNICOS'.padEnd(40)} ${String(total).padStart(7)}`);
  console.log(`   ${'Soma dos 3 indicadores'.padEnd(40)} ${String(totalClassificados).padStart(7)}`);
  console.log(`   ${'GAP (não classificados)'.padEnd(40)} ${String(total - totalClassificados).padStart(7)}`);

  // Detalhe das combinações de operação por grupo não classificado
  const naoClassificados = rows.filter(r => !indicadores.includes(r.grupo));
  if (naoClassificados.length > 0) {
    console.log(`\n── Detalhe dos grupos não classificados ──────────────────────`);
    for (const r of naoClassificados) {
      console.log(`\n  ${r.grupo} (${r.qtd} profissionais):`);
      if (r.so_inclusao > 0)   console.log(`    Só Inclusão:            ${r.so_inclusao}`);
      if (r.so_alteracao > 0)  console.log(`    Só Alteração:           ${r.so_alteracao}`);
      if (r.so_exclusao_col > 0) console.log(`  Só Exclusão:           ${r.so_exclusao_col}`);
      if (r.incl_e_alt > 0)    console.log(`    Inclusão + Alteração:   ${r.incl_e_alt}`);
      if (r.incl_e_excl > 0)   console.log(`    Inclusão + Exclusão:    ${r.incl_e_excl}`);
      if (r.alt_e_excl > 0)    console.log(`    Alteração + Exclusão:   ${r.alt_e_excl}`);
    }
  }

  console.log('');
  await pool.end();
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
