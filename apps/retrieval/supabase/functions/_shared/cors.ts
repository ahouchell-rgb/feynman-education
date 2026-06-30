// Canonical CORS headers for every edge function. Previously copy-pasted
// byte-for-byte into each function's index.ts; consolidated here so there is one
// source of truth (D12). Behaviour is unchanged — this is the exact object every
// function already used.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
