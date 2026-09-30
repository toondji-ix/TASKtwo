export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-paystack-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin"
};

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
}

export function errorResponse(error, status = 400) {
  return jsonResponse({ error: error instanceof Error ? error.message : "Request failed." }, status);
}

export function handleOptions(request) {
  return request.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}
