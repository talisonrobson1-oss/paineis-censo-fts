/**
 * Script de teste para verificar dados de resolução
 * Execute: node test-resolucao.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: '177.85.162.132',
  port: 54329,
  database: 'db_dataware',
  user: 'usr_censo',
  password: 'agsus@censo'
});

async function testResolucao() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(80));
    console.log('TESTE DE DADOS DE RESOLUÇÃO');
    console.log('='.repeat(80));
    
    // 1. Verificar divergências base (st_cnes = 'N')
    console.log('\n1. Divergências na base (st_cnes = N):');
    const divBase = await client.query(`
      SELECT 
        no_tipo_operacao_censo,
        COUNT(*) as total
      FROM censo.vinculos
      WHERE st_cnes = 'N'
      GROUP BY no_tipo_operacao_censo
    `);
    console.table(divBase.rows);
    
    // 2. Verificar competências disponíveis no espelho_cnes
    console.log('\n2. Competências disponíveis no espelho_cnes:');
    const comps = await client.query(`
      SELECT DISTINCT nu_comp, COUNT(*) as registros
      FROM censo.espelho_cnes
      GROUP BY nu_comp
      ORDER BY nu_comp DESC
      LIMIT 10
    `);
    console.table(comps.rows);
    
    // 3. Testar join entre vinculos e espelho_cnes
    console.log('\n3. Teste de JOIN (vínculos com divergência x espelho_cnes):');
    const joinTest = await client.query(`
      SELECT 
        v.no_tipo_operacao_censo,
        e.nu_comp,
        COUNT(*) as matches
      FROM censo.vinculos v
      INNER JOIN censo.espelho_cnes e 
        ON e.co_cpf = v.nu_cpf 
        AND e.co_cnes = v.co_cnes
      WHERE v.st_cnes = 'N'
        AND e.nu_comp IN ('202508', '202509', '202510', '202511')
      GROUP BY v.no_tipo_operacao_censo, e.nu_comp
      ORDER BY e.nu_comp, v.no_tipo_operacao_censo
    `);
    console.table(joinTest.rows);
    
    // 4. Verificar se há CPFs que dão match
    console.log('\n4. Amostra de CPFs com divergência que existem no espelho:');
    const cpfMatch = await client.query(`
      SELECT 
        v.nu_cpf,
        v.co_cnes,
        v.no_tipo_operacao_censo,
        COUNT(DISTINCT e.nu_comp) as competencias_encontradas
      FROM censo.vinculos v
      LEFT JOIN censo.espelho_cnes e 
        ON e.co_cpf = v.nu_cpf 
        AND e.co_cnes = v.co_cnes
      WHERE v.st_cnes = 'N'
      GROUP BY v.nu_cpf, v.co_cnes, v.no_tipo_operacao_censo
      LIMIT 5
    `);
    console.table(cpfMatch.rows);
    
    // 5. Testar query completa simplificada
    console.log('\n5. Query simplificada de resolução:');
    const simplified = await client.query(`
      SELECT 
        e.nu_comp as competencia,
        COUNT(DISTINCT v.nu_cpf) as cpfs_resolvidos
      FROM censo.vinculos v
      INNER JOIN censo.espelho_cnes e 
        ON e.co_cpf = v.nu_cpf 
        AND e.co_cnes = v.co_cnes
      WHERE v.st_cnes = 'N'
        AND e.nu_comp IN ('202508', '202509', '202510', '202511')
      GROUP BY e.nu_comp
      ORDER BY e.nu_comp
    `);
    console.table(simplified.rows);
    
    console.log('\n' + '='.repeat(80));
    console.log('DIAGNÓSTICO:');
    console.log('='.repeat(80));
    
    const totalDiv = divBase.rows.reduce((sum, r) => sum + parseInt(r.total), 0);
    const totalMatches = joinTest.rows.reduce((sum, r) => sum + parseInt(r.matches), 0);
    
    console.log(`Total de divergências (st_cnes = N): ${totalDiv}`);
    console.log(`Total de matches com espelho_cnes: ${totalMatches}`);
    
    if (totalDiv === 0) {
      console.log('\n⚠️ PROBLEMA: Não há divergências na base (st_cnes = N)');
      console.log('   Verifique se a coluna st_cnes está preenchida corretamente');
    }
    
    if (totalMatches === 0) {
      console.log('\n⚠️ PROBLEMA: Não há matches entre vínculos e espelho_cnes');
      console.log('   Possíveis causas:');
      console.log('   1. Formato de CPF diferente (com/sem zeros à esquerda)');
      console.log('   2. Formato de CNES diferente');
      console.log('   3. Competências não estão no espelho_cnes');
    }
    
    // 6. Verificar formato de CPF
    console.log('\n6. Verificar formato de CPF:');
    const cpfFormat = await client.query(`
      SELECT 
        'vinculos' as tabela,
        LENGTH(nu_cpf) as tamanho_cpf,
        nu_cpf as exemplo
      FROM censo.vinculos
      WHERE st_cnes = 'N'
      LIMIT 1
      UNION ALL
      SELECT 
        'espelho_cnes' as tabela,
        LENGTH(co_cpf) as tamanho_cpf,
        co_cpf as exemplo
      FROM censo.espelho_cnes
      LIMIT 1
    `);
    console.table(cpfFormat.rows);
    
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

testResolucao();
