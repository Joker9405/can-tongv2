import { createClient } from '@supabase/supabase-js'

// 从环境变量中获取 Supabase URL 和匿名密钥
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

// 确保环境变量已正确设置
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (and in Vercel env).'
  )
}

// 初始化 Supabase 客户端
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default supabase
