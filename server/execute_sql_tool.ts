import { Pool } from '@neondatabase/serverless';

/**
 * A simple utility to execute SQL commands
 * @param sql The SQL query to execute
 * @returns The query result
 */
export async function execute_sql_tool(sql: string): Promise<any> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    console.log(`Executing SQL: ${sql}`);
    const result = await pool.query(sql);
    return result.rows;
  } catch (error) {
    console.error('SQL execution error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}