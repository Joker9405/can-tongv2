import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (and in Vercel env).'
  );
}

// Debugging log for connection URL
console.log('Connecting to Supabase with URL:', supabaseUrl);
console.log('Supabase Anon Key:', supabaseAnonKey);

// Create the Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
