import { InferenceClient } from '@huggingface/inference';

export const maxDuration = 60;

function parseDataUrl(value: string) {
  const m = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid uploaded image.');
  return { mediaType: m[1], bytes: Buffer.from(m[2], 'base64') };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = String(body.prompt || '').trim();
    const image = String(body.image || '');
    const token = String(body.token || '').trim();
    if (!prompt || !image) return Response.json({ error: 'Upload an image and describe the change.' }, { status: 400 });
    if (!token) return Response.json({ error: 'AI connection is not set up yet.' }, { status: 401 });

    const parsed = parseDataUrl(image);
    const hf = new InferenceClient(token);
    const result = await hf.imageToImage({
      provider: 'auto',
      model: 'black-forest-labs/FLUX.1-Kontext-dev',
      inputs: new Blob([parsed.bytes], { type: parsed.mediaType }),
      parameters: {
        prompt: `${prompt}. Preserve the original image unless the requested change requires modifying it. Keep clean edges and DTF-print-ready detail.`
      }
    });

    const buffer = Buffer.from(await result.arrayBuffer());
    return Response.json({ image: { base64: buffer.toString('base64'), mediaType: result.type || 'image/png' } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : 'Image edit failed.' }, { status: 500 });
  }
}
