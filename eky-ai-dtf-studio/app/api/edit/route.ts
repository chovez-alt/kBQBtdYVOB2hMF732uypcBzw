import { generateImage } from 'ai';

export const maxDuration = 60;

function stripDataUrl(value: string) {
  const comma = value.indexOf(',');
  return comma >= 0 ? value.slice(comma + 1) : value;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = String(body.prompt || '').trim();
    const image = String(body.image || '');
    if (!prompt || !image) return Response.json({ error: 'An image and edit instruction are required.' }, { status: 400 });

    const result = await generateImage({
      model: 'openai/gpt-image-2',
      prompt: { text: prompt, images: [stripDataUrl(image)] },
      n: 1,
      maxRetries: 2
    });

    const out = result.images[0];
    return Response.json({ image: { base64: out.base64, mediaType: out.mediaType || 'image/png' } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : 'Image edit failed.' }, { status: 500 });
  }
}
