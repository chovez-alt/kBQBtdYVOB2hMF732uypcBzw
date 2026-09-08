const GENERATE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const EDIT_MODEL = '@cf/stabilityai/stable-diffusion-xl-base-1.0';

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

function stripDataUrl(value) {
  const input = String(value || '');
  const comma = input.indexOf(',');
  return input.startsWith('data:') && comma >= 0 ? input.slice(comma + 1) : input;
}

function base64ToByteArray(base64) {
  const binary = atob(base64);
  const bytes = new Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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
        generateModel: GENERATE_MODEL,
        editModel: EDIT_MODEL,
        editing: true
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

        const result = await env.AI.run(GENERATE_MODEL, {
          prompt: prompt.slice(0, 2048),
          steps,
          seed
        });

        if (!result?.image) {
          return json({ error: 'Cloudflare AI returned no image.' }, 502, origin);
        }

        return json({
          image: { base64: result.image, mediaType: 'image/jpeg' },
          model: GENERATE_MODEL,
          provider: 'cloudflare',
          seed,
          steps
        }, 200, origin);
      } catch (error) {
        console.error(error);
        return json({ error: error instanceof Error ? error.message : 'Generation failed.' }, 500, origin);
      }
    }

    if (request.method === 'POST' && url.pathname === '/edit') {
      try {
        const body = await request.json();
        const prompt = String(body?.prompt || '').trim();
        const imageB64 = stripDataUrl(body?.image);
        if (!prompt || !imageB64) {
          return json({ error: 'Upload an image and describe the change.' }, 400, origin);
        }

        const strength = Math.max(0.15, Math.min(Number(body?.strength) || 0.58, 0.95));
        const seed = Number.isInteger(body?.seed)
          ? body.seed
          : Math.floor(Math.random() * 2147483647);
        const imageBytes = base64ToByteArray(imageB64);

        const result = await env.AI.run(EDIT_MODEL, {
          prompt: `${prompt.slice(0, 1400)}. Preserve the original subject, composition and important details unless the requested change requires altering them. Professional clean DTF-print-ready result, sharp edges, no shirt mockup.`,
          negative_prompt: 'blurry, distorted, deformed, duplicate subject, extra limbs, watermark, unreadable text, low quality',
          image: imageBytes,
          num_steps: 20,
          strength,
          guidance: 7.5,
          seed
        });

        const buffer = await new Response(result).arrayBuffer();
        if (!buffer.byteLength) {
          return json({ error: 'Cloudflare AI returned no edited image.' }, 502, origin);
        }

        return json({
          image: { base64: bytesToBase64(buffer), mediaType: 'image/png' },
          model: EDIT_MODEL,
          provider: 'cloudflare',
          seed,
          strength
        }, 200, origin);
      } catch (error) {
        console.error(error);
        return json({ error: error instanceof Error ? error.message : 'Image edit failed.' }, 500, origin);
      }
    }

    return json({ error: 'Not found.' }, 404, origin);
  }
};
