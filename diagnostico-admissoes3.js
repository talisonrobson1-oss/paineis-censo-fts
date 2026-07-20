const { Pool } = require('./APIv1-0/fiocruz-api/node_modules/pg');
const pool = new Pool({
  host:'177.85.162.132', port:54329, database:'db_dataware',
  user:'usr_censo', password:'bvSs0UKS0yUANTugBXuXQivnTE2f',
  ssl:false, connectionTimeoutMillis:30000, query_timeout:90000
});

async function run() {
  const minComp = await pool.query(`SELECT MIN(nu_comp) AS c FROM censo.espelho_cnes_nova`);
  const comp = minComp.rows[0].c;
  console.log('Competência mínima:', comp);

  // Contar CPFs com Inclusão no CNES 0010456
  const r1 = await pool.query(`
    SELECT COUNT(DISTINCT nu_cpf) AS n
    FROM censo.recenseados_nova
    WHERE co_cnes = '0010456' AND no_tipo_operacao_censo = 'Inclusão'
  `);
  console.log('CPFs com Inclusão em 0010456:', r1.rows[0].n);

  // Quantos desses CPFs estão no espelho neste cnes
  const r2 = await pool.query(`
    SELECT COUNT(DISTINCT nu_cpf) AS n
    FROM censo.recenseados_nova r
    WHERE co_cnes = '0010456' AND no_tipo_operacao_censo = 'Inclusão'
      AND EXISTS (SELECT 1 FROM censo.espelho_cnes_nova e WHERE e.nu_comp=$1 AND e.co_cnes=r.co_cnes AND LPAD(e.co_cpf::text,11,'0')=r.nu_cpf::text)
  `, [comp]);
  console.log('Destes, presentes no espelho NESTE cnes (excluir corretamente):', r2.rows[0].n);

  // Quantos estão no espelho em OUTRO cnes (candidatos ao bug)
  const r3 = await pool.query(`
    SELECT COUNT(DISTINCT nu_cpf) AS n
    FROM censo.recenseados_nova r
    WHERE co_cnes = '0010456' AND no_tipo_operacao_censo = 'Inclusão'
      AND NOT EXISTS (SELECT 1 FROM censo.espelho_cnes_nova e WHERE e.nu_comp=$1 AND e.co_cnes=r.co_cnes AND LPAD(e.co_cpf::text,11,'0')=r.nu_cpf::text)
      AND EXISTS (SELECT 1 FROM censo.espelho_cnes_nova e WHERE e.nu_comp=$1 AND e.co_cnes!=r.co_cnes AND LPAD(e.co_cpf::text,11,'0')=r.nu_cpf::text)
  `, [comp]);
  console.log('Destes, NÃO em 0010456 mas em OUTRO cnes (exclusão indevida?):', r3.rows[0].n);

  // Quantos nao estao em nenhum cnes
  const r4 = await pool.query(`
    SELECT COUNT(DISTINCT nu_cpf) AS n
    FROM censo.recenseados_nova r
    WHERE co_cnes = '0010456' AND no_tipo_operacao_censo = 'Inclusão'
      AND NOT EXISTS (SELECT 1 FROM censo.espelho_cnes_nova e WHERE e.nu_comp=$1 AND LPAD(e.co_cpf::text,11,'0')=r.nu_cpf::text)
  `, [comp]);
  console.log('Destes, ausentes de TODOS os cnes do espelho:', r4.rows[0].n);

  const total = parseInt(r1.rows[0].n);
  const corretos = parseInt(r2.rows[0].n);
  const outroCnes = parseInt(r3.rows[0].n);
  const nenhum = parseInt(r4.rows[0].n);
  console.log('\nSomando: corretos+outroCnes+nenhum =', corretos+outroCnes+nenhum, '(deve ser igual ao total:', total, ')');
  console.log('\nSe stats verifica CPF globalmente: mostra', nenhum, '(=1955? →', nenhum==1955 ? 'SIM, CONFIRMA BUG' : 'não coincide)', ')');
  console.log('Verdadeiro: admissoes devem ser', total - corretos, '(=3084? →', (total-corretos)==3084 ? 'SIM' : 'não coincide', ')');

  await pool.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
