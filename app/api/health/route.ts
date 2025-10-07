import { NextResponse } from "next/server";

export async function GET() {
  // basic env presence checks
  const env = {
    NEXT_PUBLIC_BASE_URL: !!process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE: !!process.env.SUPABASE_SERVICE_ROLE,
    TOGETHER_API_KEY: !!process.env.TOGETHER_API_KEY,
    TOGETHER_MODEL: process.env.TOGETHER_MODEL || null,
    TRANSCRIBE_URL: process.env.TRANSCRIBE_URL || null,
    INGESTOR_URL: process.env.INGESTOR_URL || null,
  };

  return NextResponse.json({
    ok: true,
    env,
    timestamp: new Date().toISOString(),
  });
}
