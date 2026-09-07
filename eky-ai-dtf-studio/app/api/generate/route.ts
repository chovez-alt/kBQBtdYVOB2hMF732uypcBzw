import { InferenceClient } from '@huggingface/inference';
export const maxDuration=60;
export async function POST(req:Request){
  try{
    const {prompt,token,width,height}=await req.json();
    if(!prompt) return Response.json({error:'Prompt required'},{status:400});
    if(!token) return Response.json({error:'Add your free Hugging Face token in AI Settings first.'},{status:401});
    const client=new InferenceClient(token);
    const blob=await client.textToImage({
      model:'black-forest-labs/FLUX.1-schnell',
      inputs:String(prompt),
      parameters:{width:Number(width)||1024,height:Number(height)||1024,num_inference_steps:4}
    }, { outputType: 'blob' });
    const buf=Buffer.from(await blob.arrayBuffer());
    return Response.json({image:{base64:buf.toString('base64'),mediaType:blob.type||'image/png'}});
  }catch(e){
    console.error(e);
    return Response.json({error:e instanceof Error?e.message:'Generation failed'},{status:500});
  }
}
