import { InferenceClient } from '@huggingface/inference';

export const maxDuration = 60;

function parseDataUrl(value: string) {
  const m = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid uploaded image.');
  return { mediaType: m[1], bytes: Buffer.from(m[2], 'base64') };
}

function withTimeout<T>(promise: Promise<T>, ms = 50000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI edit took too long. Please try again.')), ms))
  ]);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = String(body.prompt || '').trim();
    const image = String(body.image || '');
    const token = String(body.token || '').trim();
    if (!prompt || !image) return Response.json({ error: 'Upload an image and describe the change.' }, { status: 400 });
    if (!token) return Response.json({ error: 'Open AI Settings and add your Hugging Face token first.' }, { status: 401 });

    const parsed = parseDataUrl(image);
    const hf = new InferenceClient(token);
    const result = await withTimeout(hf.imageToImage({
      provider: 'replicate',
      model: 'black-forest-labs/FLUX.2-dev',
      inputs: new Blob([parsed.bytes], { type: parsed.mediaType }),
      parameters: {
        prompt: `${prompt}. Preserve the original image unless the requested change requires modifying it. Keep clean edges and DTF-print-ready detail.`
      }
    }));

    const buffer = Buffer.from(await result.arrayBuffer());
    return Response.json({ image: { base64: buffer.toString('base64'), mediaType: result.type || 'image/png' } });
  } catch (error) {
    console.error(error);
    const raw = error instanceof Error ? error.message : 'Image edit failed.';
    const msg = /401|authentication|permission|unauthorized/i.test(raw)
      ? 'Your Hugging Face token needs Inference Providers permission. Open AI Settings and replace the token with one that has that permission.'
      : raw;
    return Response.json({ error: msg }, { status: 500 });
  }
}
