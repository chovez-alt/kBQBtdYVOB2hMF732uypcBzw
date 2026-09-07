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
    if (!prompt) return Response.json({ error: 'Prompt is required.' }, { status: 400 });

    const refs: string[] = Array.isArray(body.references) ? body.references.slice(0, 4) : [];
    const n = Math.min(4, Math.max(1, Number(body.n) || 1));
    const aspectRatio = String(body.aspectRatio || '1:1');

    const result = await generateImage({
      model: 'openai/gpt-image-2',
      prompt: refs.length ? { text: prompt, images: refs.map(stripDataUrl) } : prompt,
      n,
      aspectRatio,
      maxRetries: 2
    });

    return Response.json({
      images: result.images.map(img => ({
        base64: img.base64,
        mediaType: img.mediaType || 'image/png'
      }))
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : 'Image generation failed.' }, { status: 500 });
  }
}
