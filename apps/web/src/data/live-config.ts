/**
 * Where the Live switch connects. Both values are public by design (the publishable key only
 * identifies the project; every table and RPC still enforces row-level security and the signed-in
 * role), so they may sit in the bundle. NEVER put the secret key, the database password, an access
 * token or a demo password here.
 */
export const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://syneldpwijlwcyqzcbvz.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY: string = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_7WB9JZeUCIFQ8LoK_e2POQ_9DM7K3I-";
