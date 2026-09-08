import {NextResponse} from 'next/server';

const MODEL='gemini-3.1-flash-image';

function imageFromResponse(data:any){
  const parts=data?.candidates?.[0]?.content?.parts||[];
  const p=parts.find((x:any)=>x?.inlineData?.data);
  return p?.inlineData?{base64:p.inlineData.data,mediaType:p.inlineData.mimeType||'image/png'}:null;
}

export async function POST(req:Request){
  try{
    const key=process.env.GEMINI_API_KEY;
    if(!key)return NextResponse.json({error:'Gemini API key is not configured.'},{status:500});
    const body=await req.json();
    const prompt=String(body?.prompt||'').trim();
    if(!prompt)return NextResponse.json({error:'Prompt is required.'},{status:400});
    const parts:any[]=[];
    if(body?.image){
      const m=String(body.image).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
      if(!m)return NextResponse.json({error:'Invalid reference image.'},{status:400});
      parts.push({inlineData:{mimeType:m[1],data:m[2]}});
    }
    parts.push({text:prompt});
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({contents:[{parts}],generationConfig:{responseModalities:['TEXT','IMAGE']}})
    });
    const data=await r.json();
    if(!r.ok)return NextResponse.json({error:data?.error?.message||`Gemini request failed (${r.status})`},{status:r.status});
    const image=imageFromResponse(data);
    if(!image)return NextResponse.json({error:'Gemini did not return an image. Try a different prompt or image.'},{status:502});
    return NextResponse.json({image,model:MODEL});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Gemini request failed.'},{status:500});
  }
}
