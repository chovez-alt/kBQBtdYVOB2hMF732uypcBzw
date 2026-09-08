import { InferenceClient } from '@huggingface/inference';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const token = process.env.HF_TOKEN;
    if (!token) return Response.json({ error: 'Hugging Face token is not configured.' }, { status: 500 });
    const { prompt, image } = await req.json();
    if (!prompt?.trim()) return Response.json({ error: 'Prompt is required.' }, { status: 400 });

    const client = new InferenceClient(token);
    let result: Blob;
    if (image) {
      const m = String(image).match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return Response.json({ error: 'Invalid reference image.' }, { status: 400 });
      const bytes = Uint8Array.from(Buffer.from(m[2], 'base64'));
      const input = new Blob([bytes], { type: m[1] });
      result = await client.imageToImage({
        model: 'black-forest-labs/FLUX.1-Kontext-dev',
        inputs: input,
        parameters: { prompt: prompt.trim() }
      });
    } else {
      result = await client.textToImage({
        model: 'black-forest-labs/FLUX.1-schnell',
        inputs: prompt.trim(),
      }, { outputType: 'blob' });
    }
    const mediaType = result.type || 'image/png';
    const base64 = Buffer.from(await result.arrayBuffer()).toString('base64');
    return Response.json({ image: { base64, mediaType }, provider: 'huggingface' });
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Hugging Face image request failed.' }, { status: 500 });
  }
}
