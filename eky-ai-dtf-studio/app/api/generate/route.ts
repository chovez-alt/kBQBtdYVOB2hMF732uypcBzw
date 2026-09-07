import { InferenceClient } from '@huggingface/inference';

export const maxDuration = 60;

function withTimeout<T>(promise: Promise<T>, ms = 50000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI generation took too long. Please try again.')), ms))
  ]);
}

export async function POST(req: Request) {
  try {
    const { prompt, token, width, height } = await req.json();
    if (!prompt) return Response.json({ error: 'Prompt required.' }, { status: 400 });
    if (!token) return Response.json({ error: 'Open AI Settings and add your Hugging Face token first.' }, { status: 401 });

    const client = new InferenceClient(String(token));
    const blob = await withTimeout(client.textToImage({
      provider: 'replicate',
      model: 'black-forest-labs/FLUX.1-schnell',
      inputs: String(prompt),
      parameters: {
        width: Math.min(Number(width) || 768, 768),
        height: Math.min(Number(height) || 768, 768),
        num_inference_steps: 4
      }
    }, { outputType: 'blob' }));

    const buf = Buffer.from(await blob.arrayBuffer());
    return Response.json({ image: { base64: buf.toString('base64'), mediaType: blob.type || 'image/png' } });
  } catch (e) {
    console.error(e);
    const raw = e instanceof Error ? e.message : 'Generation failed.';
    const msg = /401|authentication|permission|unauthorized/i.test(raw)
      ? 'Your Hugging Face token needs Inference Providers permission. Open AI Settings and replace the token with one that has that permission.'
      : raw;
    return Response.json({ error: msg }, { status: 500 });
  }
}
