const MODEL = '@cf/black-forest-labs/flux-1-schnell';

const allowedOrigins = new Set([
  'https://eky-ai-dtf-studio.vercel.app',
  'https://eky-ai-dtf-studio-chovez-8065.vercel.app'
]);

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://eky-ai-dtf-studio.vercel.app',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...cors(origin)
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({
        ok: true,
        service: 'EKY AI DTF Studio Cloudflare Worker',
        provider: 'Cloudflare Workers AI',
        model: MODEL
      }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/generate') {
      try {
        const body = await request.json();
        const prompt = String(body?.prompt || '').trim();
        if (!prompt) return json({ error: 'Prompt required.' }, 400, origin);

        const steps = Math.max(1, Math.min(Number(body?.steps) || 4, 8));
        const seed = Number.isInteger(body?.seed)
          ? body.seed
          : Math.floor(Math.random() * 2147483647);

        const result = await env.AI.run(MODEL, {
          prompt: prompt.slice(0, 2048),
          steps,
          seed
        });

        if (!result?.image) {
          return json({ error: 'Cloudflare AI returned no image.' }, 502, origin);
        }

        return json({
          image: {
            base64: result.image,
            mediaType: 'image/jpeg'
          },
          model: MODEL,
          provider: 'cloudflare',
          seed,
          steps
        }, 200, origin);
      } catch (error) {
        console.error(error);
        return json({
          error: error instanceof Error ? error.message : 'Generation failed.'
        }, 500, origin);
      }
    }

    return json({ error: 'Not found.' }, 404, origin);
  }
};
