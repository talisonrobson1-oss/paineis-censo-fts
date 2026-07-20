// diagnostico-admissoes.js
// Compara o resultado da query de admissões da stats API com o diagnóstico correto

const { Pool } = require('./APIv1-0/fiocruz-api/node_modules/pg');
const pool = new Pool({
  host: '177.85.162.132', port: 54329, database: 'db_dataware',
  user: 'usr_censo', password: 'bvSs0UKS0yUANTugBXuXQivnTE2f',
  ssl: false, connectionTimeoutMillis: 30000, query_timeout: 120000,
});

async function run() {
  const CNES = '0010456';
  console.log(`\nCNES: ${CNES}\n`);

  // 1. Exatamente como a stats query faz (co_cnes::text do espelho, sem LPAD)
  const r1 = await pool.query(`
    WITH min_comp AS (SELECT MIN(nu_comp) AS nu_comp FROM censo.espelho_cnes_nova),
    espelho_min AS (
      SELECT DISTINCT LPAD(co_cpf::text, 11, '0') AS co_cpf, co_cnes::text AS co_cnes
      FROM censo.espelho_cnes_nova WHERE nu_comp = (SELECT nu_comp FROM min_comp)
    )
    SELECT COUNT(DISTINCT nu_cpf) AS n
    FROM censo.recenseados_nova
    WHERE co_cnes = $1
      AND no_tipo_operacao_censo = 'Inclusão'
      AND NOT EXISTS (
        SELECT 1 FROM espelho_min e
        WHERE e.co_cpf = nu_cpf::text AND e.co_cnes = co_cnes::text
      )
  `, [CNES]);
  console.log('Stats (espelho co_cnes::text, sem LPAD):       ', r1.rows[0].n);

  // 2. Co_cnes do espelho com LPAD(7,'0') para forçar zero à esquerda
  const r2 = await pool.query(`
    WITH min_comp AS (SELECT MIN(nu_comp) AS nu_comp FROM censo.espelho_cnes_nova),
    espelho_min AS (
      SELECT DISTINCT LPAD(co_cpf::text, 11, '0') AS co_cpf, LPAD(co_cnes::text, 7, '0') AS co_cnes
      FROM censo.espelho_cnes_nova WHERE nu_comp = (SELECT nu_comp FROM min_comp)
    )
    SELECT COUNT(DISTINCT nu_cpf) AS n
    FROM censo.recenseados_nova
    WHERE co_cnes = $1
      AND no_tipo_operacao_censo = 'Inclusão'
      AND NOT EXISTS (
        SELECT 1 FROM espelho_min e
        WHERE e.co_cpf = nu_cpf::text AND e.co_cnes = co_cnes::text
      )
  `, [CNES]);
  console.log('Stats (espelho co_cnes LPAD 7):                ', r2.rows[0].n);

  // 3. Comparar por CPF apenas (sem checar CNES no espelho) — hypothese: CNES mismatch
  const r3 = await pool.query(`
    WITH min_comp AS (SELECT MIN(nu_comp) AS nu_comp FROM censo.espelho_cnes_nova),
    espelho_min_global AS (
      SELECT DISTINCT LPAD(co_cpf::text, 11, '0') AS co_cpf
      FROM censo.espelho_cnes_nova WHERE nu_comp = (SELECT nu_comp FROM min_comp)
    ),
    espelho_cnes_local AS (
      SELECT DISTINCT LPAD(co_cpf::text, 11, '0') AS co_cpf
      FROM censo.espelho_cnes_nova WHERE nu_comp = (SELECT MIN(nu_comp) FROM censo.espelho_cnes_nova)
        AND co_cnes = $1
    )
    SELECT
      COUNT(DISTINCT nu_cpf) FILTER (
        WHERE no_tipo_operacao_censo = 'Inclusão'
          AND NOT EXISTS (SELECT 1 FROM espelho_cnes_local e WHERE e.co_cpf = nu_cpf::text)
      ) AS adm_espelho_local,
      COUNT(DISTINCT nu_cpf) FILTER (
        WHERE no_tipo_operacao_censo = 'Inclusão'
          AND NOT EXISTS (SELECT 1 FROM espelho_min_global e WHERE e.co_cpf = nu_cpf::text)
      ) AS adm_espelho_global_cpf_only
    FROM censo.recenseados_nova
    WHERE co_cnes = $1
  `, [CNES]);
  console.log('Admissão checando espelho local (só CNES 0010456):', r3.rows[0].adm_espelho_local);
  console.log('Admissão checando espelho global (só CPF):         ', r3.rows[0].adm_espelho_global_cpf_only);

  // 4. Quantos dos CPFs com Inclusão estão em espelho mas em OUTRO cnes
  const r4 = await pool.query(`
    WITH min_comp AS (SELECT MIN(nu_comp) AS nu_comp FROM censo.espelho_cnes_nova),
    espelho_min AS (
      SELECT DISTINCT LPAD(co_cpf::text, 11, '0') AS co_cpf, co_cnes::text AS co_cnes
      FROM censo.espelho_cnes_nova WHERE nu_comp = (SELECT nu_comp FROM min_comp)
    ),
    inclusoes AS (
      SELECT DISTINCT nu_cpf::text AS cpf
      FROM censo.recenseados_nova
      WHERE co_cnes = $1 AND no_tipo_operacao_censo = 'Inclusão'
    )
    SELECT
      COUNT(*) AS total_cpfs_com_inclusao,
      COUNT(CASE WHEN EXISTS(SELECT 1 FROM espelho_min e WHERE e.co_cpf = i.cpf AND e.co_cnes = $1)       THEN 1 END) AS no_espelho_neste_cnes,
      COUNT(CASE WHEN EXISTS(SELECT 1 FROM espelho_min e WHERE e.co_cpf = i.cpf AND e.co_cnes != $1)      THEN 1 END) AS no_espelho_outro_cnes,
      COUNT(CASE WHEN NOT EXISTS(SELECT 1 FROM espelho_min e WHERE e.co_cpf = i.cpf)                      THEN 1 END) AS nao_esta_em_nenhum_cnes
    FROM inclusoes i
  `, [CNES]);
  console.log('\nDe todos os CPFs com Inclusão no CNES 0010456:');
  const r = r4.rows[0];
  console.log('  Total CPFs com Inclusão:                         ', r.total_cpfs_com_inclusao);
  console.log('  Presentes no espelho NESTE CNES:                 ', r.no_espelho_neste_cnes);
  console.log('  Presentes no espelho em OUTRO CNES (não 0010456):', r.no_espelho_outro_cnes);
  console.log('  Não estão em NENHUM cnes do espelho:             ', r.nao_esta_em_nenhum_cnes);
  console.log('\n  → A stats conta como admissão apenas os do "Não estão em nenhum cnes"');
  console.log('  → Deveria contar: "Não em nenhum cnes" + "Em outro cnes"');

  await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
