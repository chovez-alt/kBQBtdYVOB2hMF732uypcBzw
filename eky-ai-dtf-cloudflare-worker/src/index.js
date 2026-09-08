const GENERATE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const EDIT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

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
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) }
  });
}

function parseDataUrl(value) {
  const input = String(value || '');
  const m = input.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid uploaded image.');
  return { type: m[1] || 'image/jpeg', base64: m[2] };
}

function base64ToBlob(base64, type) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({ ok: true, service: 'EKY AI DTF Studio Cloudflare Worker', provider: 'Cloudflare Workers AI', generateModel: GENERATE_MODEL, editModel: EDIT_MODEL, editing: true }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/generate') {
      try {
        const body = await request.json();
        const prompt = String(body?.prompt || '').trim();
        if (!prompt) return json({ error: 'Prompt required.' }, 400, origin);
        const steps = Math.max(1, Math.min(Number(body?.steps) || 4, 8));
        const seed = Number.isInteger(body?.seed) ? body.seed : Math.floor(Math.random() * 2147483647);
        const result = await env.AI.run(GENERATE_MODEL, { prompt: prompt.slice(0, 2048), steps, seed });
        if (!result?.image) return json({ error: 'Cloudflare AI returned no image.' }, 502, origin);
        return json({ image: { base64: result.image, mediaType: 'image/jpeg' }, model: GENERATE_MODEL, provider: 'cloudflare', seed, steps }, 200, origin);
      } catch (error) {
        console.error(error);
        return json({ error: error instanceof Error ? error.message : 'Generation failed.' }, 500, origin);
      }
    }

    if (request.method === 'POST' && url.pathname === '/edit') {
      try {
        const body = await request.json();
        const prompt = String(body?.prompt || '').trim();
        if (!prompt || !body?.image) return json({ error: 'Upload an image and describe the change.' }, 400, origin);

        const parsed = parseDataUrl(body.image);
        const imageBlob = base64ToBlob(parsed.base64, parsed.type);
        const seed = Number.isInteger(body?.seed) ? body.seed : Math.floor(Math.random() * 2147483647);

        const form = new FormData();
        form.append('prompt', `${prompt.slice(0, 1400)}. Use the uploaded image as the main reference. Preserve the subject identity and composition unless the requested edit requires changing them. Clean professional DTF-print-ready result.`);
        form.append('input_image_0', imageBlob, 'reference.png');
        form.append('width', '1024');
        form.append('height', '1024');
        form.append('guidance', '3.5');
        form.append('seed', String(seed));

        const formResponse = new Response(form);
        const result = await env.AI.run(EDIT_MODEL, {
          multipart: {
            body: formResponse.body,
            contentType: formResponse.headers.get('content-type')
          }
        });

        if (!result?.image) return json({ error: 'Cloudflare FLUX.2 returned no edited image.' }, 502, origin);
        return json({ image: { base64: result.image, mediaType: 'image/jpeg' }, model: EDIT_MODEL, provider: 'cloudflare', seed }, 200, origin);
      } catch (error) {
        console.error(error);
        return json({ error: error instanceof Error ? error.message : 'Image edit failed.' }, 500, origin);
      }
    }

    return json({ error: 'Not found.' }, 404, origin);
  }
};
