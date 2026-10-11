import { open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getR2ClientConfigFromEnv } from "../storage/r2-config.js";
import { createR2S3Client } from "../storage/r2-s3-client.js";
import { EditorError } from "./types.js";

/** No upstream fallback. The caller has already verified ownership and the exact canonical key. */
export function ownedStorageReader(storageRoot:string,signal:AbortSignal){
  return async (input:{creatorId:string;mediaId:string;storageKey:string;maxBytes:number}):Promise<Buffer>=>{
    signal.throwIfAborted();
    if(input.storageKey.startsWith("relay/tenants/")){
      const cfg=getR2ClientConfigFromEnv();if(!cfg)throw new EditorError("STORAGE_UNAVAILABLE","Image storage is unavailable.",503);
      const client=createR2S3Client(cfg);
      try{
        const object=await client.send(new GetObjectCommand({Bucket:cfg.bucket,Key:input.storageKey}),{abortSignal:signal});
        if(!object.Body||Number(object.ContentLength)>input.maxBytes)throw new EditorError("IMAGE_LIMIT","Image exceeds inspection size limit.");
        const chunks:Buffer[]=[];let size=0;
        for await(const raw of object.Body as AsyncIterable<Uint8Array>){signal.throwIfAborted();const chunk=Buffer.from(raw);size+=chunk.length;if(size>input.maxBytes)throw new EditorError("IMAGE_LIMIT","Image exceeds inspection size limit.");chunks.push(chunk);}
        return Buffer.concat(chunks);
      }finally{client.destroy();}
    }
    const root=await realpath(join(storageRoot,input.creatorId));
    const path=await realpath(join(root,...input.storageKey.split("/"))),rel=relative(root,path);
    if(rel.startsWith("..")||isAbsolute(rel))throw new EditorError("INVALID_MEDIA","Image path is outside this creator's storage.");
    const handle=await open(path,"r");
    try{if((await handle.stat()).size>input.maxBytes)throw new EditorError("IMAGE_LIMIT","Image exceeds inspection size limit.");signal.throwIfAborted();return await handle.readFile({signal});}finally{await handle.close();}
  };
}
