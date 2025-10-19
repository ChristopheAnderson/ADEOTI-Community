import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in .env');
}

// Initialisation de Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialisation de la base de données uniquement en local/développement
if (process.env.NODE_ENV !== 'production' && databaseUrl) {
  async function initializeDatabase() {
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    });

    try {
      const client = await pool.connect();
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS participants (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT NOT NULL,
          password TEXT NOT NULL,
          city TEXT,
          source TEXT,
          message TEXT,
          participe BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Database initialized successfully: uuid-ossp extension enabled and participants table created');
      client.release();
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    } finally {
      await pool.end();
    }
  }

  initializeDatabase();
}

export default supabase;