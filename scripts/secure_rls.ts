import { getPostgresPool } from "../src/lib/server/db/postgres";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("Enabling RLS and adding deny_all policies on all public tables...");
  
  const pool = getPostgresPool();
  
  try {
    await pool.query(`
      DO $$ 
      DECLARE 
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
        LOOP
          -- Enable RLS on the table
          EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' ENABLE ROW LEVEL SECURITY;';
          
          -- Drop the policy if it exists to avoid errors on reruns
          EXECUTE 'DROP POLICY IF EXISTS deny_all_from_api ON public.' || quote_ident(r.tablename) || ';';
          
          -- Create a policy that denies all operations via the PostgREST API
          EXECUTE 'CREATE POLICY deny_all_from_api ON public.' || quote_ident(r.tablename) || ' FOR ALL TO PUBLIC USING (false);';
        END LOOP;
      END $$;
    `);
    
    console.log("✅ Successfully enabled RLS and secured all public tables.");
  } catch (error) {
    console.error("❌ Error applying RLS:", error);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
