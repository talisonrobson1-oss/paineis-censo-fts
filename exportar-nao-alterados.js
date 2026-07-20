// exportar-nao-alterados.js
// Exporta os vínculos NÃO alterados pelo projeto para o CNES informado

const { Pool } = require('./APIv1-0/fiocruz-api/node_modules/pg');
const XLSX      = require('./APIv1-0/fiocruz-api/node_modules/xlsx');
const path      = require('path');

const CNES = process.argv[2] || '0010456';

const pool = new Pool({
  host:     '177.85.162.132',
  port:     54329,
  database: 'db_dataware',
  user:     'usr_censo',
  password: 'bvSs0UKS0yUANTugBXuXQivnTE2f',
  ssl: false,
  connectionTimeoutMillis: 30000,
  query_timeout: 120000,
});

async function main() {
  console.log(`\n🔍 Buscando vínculos não alterados — CNES: ${CNES} ...\n`);

  const sql = `
    WITH min_comp_cte AS (
      SELECT MIN(nu_comp) AS nu_comp FROM censo.espelho_cnes_nova
    ),
    espelho_min AS (
      SELECT e.*
      FROM censo.espelho_cnes_nova e
      WHERE e.nu_comp = (SELECT nu_comp FROM min_comp_cte)
        AND e.co_cnes = $1
    )
    SELECT
      e.co_cnes                                           AS "CNES",
      LPAD(e.co_cpf::text, 11, '0')                      AS "CPF",
      e.co_cbo                                            AS "CBO",
      e.ind_vinculacao                                    AS "Tipo Vinculação",
      e.nu_comp                                           AS "Competência Espelho",
      COALESCE(e.qt_carga_horaria_ambulatorial::numeric, 0) AS "CH Ambulatorial",
      COALESCE(e.qt_carga_hor_hosp_sus::numeric, 0)        AS "CH Hospitalar",
      COALESCE(e.qt_carga_horaria_outros::numeric, 0)       AS "CH Outros"
    FROM espelho_min e
    WHERE NOT EXISTS (
      SELECT 1 FROM censo.recenseados_nova v
      WHERE v.nu_cpf                = e.co_cpf
        AND v.co_cnes               = e.co_cnes
        AND v.nu_vinculacao::text   = e.ind_vinculacao::text
        AND v.co_cbo_ocupacao::text = e.co_cbo::text
        AND COALESCE(v.qt_carga_horaria_ambulatorial::numeric, 0) = COALESCE(e.qt_carga_horaria_ambulatorial::numeric, 0)
        AND COALESCE(v.qt_carga_horaria_hospitalar::numeric, 0)   = COALESCE(e.qt_carga_hor_hosp_sus::numeric, 0)
        AND COALESCE(v.qt_carga_horaria_outros::numeric, 0)       = COALESCE(e.qt_carga_horaria_outros::numeric, 0)
    )
    ORDER BY e.co_cpf, e.co_cbo, e.ind_vinculacao
  `;

  const { rows } = await pool.query(sql, [CNES]);
  console.log(`✅ ${rows.length} registros encontrados.`);

  if (rows.length === 0) {
    console.log('Nenhum vínculo não alterado encontrado para este CNES.');
    await pool.end();
    return;
  }

  // Monta competência legível
  const comp = String(rows[0]['Competência Espelho']);
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const labelComp = `${meses[parseInt(comp.slice(4,6)) - 1]}/${comp.slice(0,4)}`;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 10 }, // CNES
    { wch: 14 }, // CPF
    { wch: 10 }, // CBO
    { wch: 18 }, // Tipo Vinculação
    { wch: 20 }, // Competência Espelho
    { wch: 16 }, // CH Ambulatorial
    { wch: 16 }, // CH Hospitalar
    { wch: 12 }, // CH Outros
    { wch: 14 }, // CH Outros
  ];
  XLSX.utils.book_append_sheet(wb, ws, `Nao Alterados ${labelComp.replace('/', '-')}`);

  const outFile = path.join(__dirname, `nao_alterados_CNES${CNES}_${comp}.xlsx`);
  XLSX.writeFile(wb, outFile);
  console.log(`\n📁 Arquivo gerado: ${outFile}\n`);

  await pool.end();
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
