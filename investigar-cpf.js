// investigar-cpf.js — diagnóstico de um CPF específico

const { Pool } = require('./APIv1-0/fiocruz-api/node_modules/pg');

const CPF  = process.argv[2] || '00004400194';
const CNES = process.argv[3] || '0010456';

const pool = new Pool({
  host: '177.85.162.132', port: 54329, database: 'db_dataware',
  user: 'usr_censo', password: 'bvSs0UKS0yUANTugBXuXQivnTE2f',
  ssl: false, connectionTimeoutMillis: 30000, query_timeout: 60000,
});

async function main() {
  console.log(`\n══════════════════════════════════════════════`);
  console.log(`CPF: ${CPF}   CNES: ${CNES}`);
  console.log(`══════════════════════════════════════════════\n`);

  // 1. Espelho (competência mínima)
  const espelho = await pool.query(`
    SELECT
      e.co_cnes, LPAD(e.co_cpf::text,11,'0') AS co_cpf, e.co_cbo, e.ind_vinculacao,
      e.nu_comp,
      COALESCE(e.qt_carga_horaria_ambulatorial::numeric,0) AS ch_amb,
      COALESCE(e.qt_carga_hor_hosp_sus::numeric,0)         AS ch_hosp,
      COALESCE(e.qt_carga_horaria_outros::numeric,0)       AS ch_out
    FROM censo.espelho_cnes_nova e
    WHERE e.nu_comp = (SELECT MIN(nu_comp) FROM censo.espelho_cnes_nova)
      AND e.co_cnes = $1
      AND LPAD(e.co_cpf::text,11,'0') = $2
    ORDER BY e.co_cbo, e.ind_vinculacao
  `, [CNES, CPF]);

  console.log(`📋 ESPELHO (comp mínima) — ${espelho.rows.length} registro(s):`);
  espelho.rows.forEach((r,i) => {
    console.log(`  [${i+1}] CBO=${r.co_cbo}  Vinc=${r.ind_vinculacao}  CH_Amb=${r.ch_amb}  CH_Hosp=${r.ch_hosp}  CH_Out=${r.ch_out}  Comp=${r.nu_comp}`);
  });

  // 2. Recenseados
  const recenseados = await pool.query(`
    SELECT
      v.co_cnes, v.nu_cpf, v.co_cbo_ocupacao, v.nu_vinculacao,
      v.no_tipo_operacao_censo,
      COALESCE(v.qt_carga_horaria_ambulatorial::numeric,0) AS ch_amb,
      COALESCE(v.qt_carga_horaria_hospitalar::numeric,0)   AS ch_hosp,
      COALESCE(v.qt_carga_horaria_outros::numeric,0)       AS ch_out
    FROM censo.recenseados_nova v
    WHERE v.co_cnes = $1
      AND v.nu_cpf  = $2
    ORDER BY v.co_cbo_ocupacao, v.nu_vinculacao, v.no_tipo_operacao_censo
  `, [CNES, CPF]);

  console.log(`\n📋 RECENSEADOS_NOVA — ${recenseados.rows.length} registro(s):`);
  recenseados.rows.forEach((r,i) => {
    console.log(`  [${i+1}] CBO=${r.co_cbo_ocupacao}  Vinc=${r.nu_vinculacao}  CH_Amb=${r.ch_amb}  CH_Hosp=${r.ch_hosp}  CH_Out=${r.ch_out}  Operação="${r.no_tipo_operacao_censo}"`);
  });

  // 3. Simular o NOT EXISTS para cada linha do espelho
  console.log(`\n🔎 SIMULAÇÃO DO NOT EXISTS (chave completa com cargas):`);
  for (const e of espelho.rows) {
    const match = recenseados.rows.find(v =>
      String(v.nu_cpf).padStart(11,'0') === CPF &&
      String(v.co_cnes)          === String(e.co_cnes) &&
      String(v.nu_vinculacao)    === String(e.ind_vinculacao) &&
      String(v.co_cbo_ocupacao)  === String(e.co_cbo) &&
      Number(v.ch_amb)  === Number(e.ch_amb) &&
      Number(v.ch_hosp) === Number(e.ch_hosp) &&
      Number(v.ch_out)  === Number(e.ch_out)
    );
    const matchSemCH = recenseados.rows.find(v =>
      String(v.nu_cpf).padStart(11,'0') === CPF &&
      String(v.co_cnes)          === String(e.co_cnes) &&
      String(v.nu_vinculacao)    === String(e.ind_vinculacao) &&
      String(v.co_cbo_ocupacao)  === String(e.co_cbo)
    );
    console.log(`\n  Espelho → CBO=${e.co_cbo} Vinc=${e.ind_vinculacao} CH=(${e.ch_amb}/${e.ch_hosp}/${e.ch_out})`);
    console.log(`    COM cargas horárias:  ${match      ? `✅ ENCONTRADO → Alterado (op: ${match.no_tipo_operacao_censo})` : '❌ NÃO encontrado → classificado como Não Alterado'}`);
    console.log(`    SEM cargas horárias:  ${matchSemCH ? `✅ ENCONTRADO → Alterado (op: ${matchSemCH.no_tipo_operacao_censo})` : '❌ NÃO encontrado → classificado como Não Alterado'}`);
  }

  await pool.end();
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
