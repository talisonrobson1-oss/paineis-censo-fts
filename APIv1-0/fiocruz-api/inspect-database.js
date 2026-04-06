/**
 * Script de Inspeção do Banco de Dados
 * Execute este script no seu servidor para obter a estrutura das tabelas
 * 
 * Instalação:
 * npm install pg
 * 
 * Execução:
 * node inspect-database.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: '177.85.162.132',
  port: 54329,
  database: 'db_dataware',
  user: 'usr_censo',
  password: 'agsus@censo'
});

async function inspectTables() {
  const client = await pool.connect();
  
  try {
    console.log('========================================');
    console.log('INSPEÇÃO DAS TABELAS DO SCHEMA CENSO');
    console.log('========================================\n');

    const tables = ['espelho_cnes', 'recenseamento', 'vinculos'];
    
    for (const table of tables) {
      console.log(`\n📊 TABELA: censo.${table}`);
      console.log('─'.repeat(80));
      
      // Obter estrutura da tabela
      const structureQuery = `
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'censo'
          AND table_name = $1
        ORDER BY ordinal_position;
      `;
      
      const { rows: columns } = await client.query(structureQuery, [table]);
      
      console.log('\nColunas:');
      columns.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const maxLen = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
        console.log(`  - ${col.column_name}: ${col.data_type}${maxLen} ${nullable}`);
      });
      
      // Contar registros
      const countQuery = `SELECT COUNT(*) as total FROM censo.${table}`;
      const { rows: [{ total }] } = await client.query(countQuery);
      console.log(`\nTotal de registros: ${total}`);
      
      // Mostrar exemplo de 2 registros
      const sampleQuery = `SELECT * FROM censo.${table} LIMIT 2`;
      const { rows: samples } = await client.query(sampleQuery);
      
      if (samples.length > 0) {
        console.log('\nExemplo de registros:');
        console.log(JSON.stringify(samples, null, 2));
      }
      
      console.log('\n' + '='.repeat(80));
    }
    
    console.log('\n✅ Inspeção concluída!\n');
    
  } catch (err) {
    console.error('❌ Erro ao inspecionar banco:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

inspectTables();
