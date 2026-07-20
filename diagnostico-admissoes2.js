const { Pool } = require('./APIv1-0/fiocruz-api/node_modules/pg');
const pool = new Pool({
  host:'177.85.162.132', port:54329, database:'db_dataware',
  user:'usr_censo', password:'bvSs0UKS0yUANTugBXuXQivnTE2f',
  ssl:false, connectionTimeoutMillis:30000, query_timeout:90000
});

async function run() {
  // Hipótese: o NOT EXISTS na stats query verifica CPF em QUALQUER cnes do espelho (não só neste)
  // Isso ocorreria se 'co_cnes' no NOT EXISTS resolver para espelho_min.co_cnes (tautologia)
  // Resultado esperado: stats excluiria quem está em espelho de qualquer cnes

  const r = await pool.query(`
    WITH min_comp AS (SELECT MIN(nu_comp) AS nu_comp FROM censo.espelho_cnes_nova),
    espelho_min AS (
      SELECT DISTINCT LPAD(co_cpf::text,11,'0') AS co_cpf, co_cnes::text AS co_cnes
      FROM censo.espelho_cnes_nova WHERE nu_comp=(SELECT nu_comp FROM min_comp)
    ),
    inclusoes AS (
      SELECT DISTINCT nu_cpf::text AS cpf
      FROM censo.recenseados_nova
      WHERE co_cnes = '0010456' AND no_tipo_operacao_censo = 'Inclusão'
    )
    SELECT
      COUNT(*)                                                                                          AS total_cpf_com_inclusao,
      COUNT(CASE WHEN NOT EXISTS(SELECT 1 FROM espelho_min e WHERE e.co_cpf=a.cpf AND e.co_cnes='0010456')   THEN 1 END) AS nao_em_espelho_neste_cnes,
      COUNT(CASE WHEN NOT EXISTS(SELECT 1 FROM espelho_min e WHERE e.co_cpf=a.cpf)                           THEN 1 END) AS nao_em_espelho_em_nenhum_cnes,
      COUNT(CASE WHEN     EXISTS(SELECT 1 FROM espelho_min e WHERE e.co_cpf=a.cpf AND e.co_cnes='0010456')   THEN 1 END) AS em_espelho_neste_cnes,
      COUNT(CASE WHEN NOT EXISTS(SELECT 1 FROM espelho_min e WHERE e.co_cpf=a.cpf AND e.co_cnes='0010456')
                  AND     EXISTS(SELECT 1 FROM espelho_min e WHERE e.co_cpf=a.cpf AND e.co_cnes!='0010456')  THEN 1 END) AS nao_aqui_mas_em_outro_cnes
    FROM inclusoes a
  `);

  const row = r.rows[0];
  console.log('\n=== DIAGNÓSTICO DE ADMISSÕES ===\n');
  console.log('Total de CPFs únicos com Inclusão no CNES 0010456:');
  console.log('  Total:                                     ', row.total_cpf_com_inclusao);
  console.log('');
  console.log('Distribuição por presença no espelho:');
  console.log('  NÃO estão no espelho deste CNES:           ', row.nao_em_espelho_neste_cnes, '← deveria ser o valor de Admissões');
  console.log('    dos quais NÃO estão em NENHUM cnes:      ', row.nao_em_espelho_em_nenhum_cnes, '← o que stats conta (se verifica cpf global)');
  console.log('    dos quais estão em OUTRO cnes:           ', row.nao_aqui_mas_em_outro_cnes, '← estes são excluídos indevidamente?');
  console.log('  ESTÃO no espelho deste CNES:               ', row.em_espelho_neste_cnes, '← correto excluir (já existiam)');
  console.log('');
  console.log('Diagnóstico anterior confirmou Admissões = 3084');
  console.log('Stats mostra Admissões = 1955');
  console.log('Diferença = ', row.nao_em_espelho_neste_cnes - 1955, '(deve bater com "em outro cnes":', row.nao_aqui_mas_em_outro_cnes, ')');

  await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
