import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { EditorError } from "./types.js";

type Phase = "development" | "heldout";
type Reservation = { id:string;model:string;phase:Phase;reservedUsd:number;actualUsd:number|null;settled:boolean;createdAt:string };
/** Durable conservative ledger. Unknown charges keep their full reservation, including after restart. */
export class FileProviderBudget {
  constructor(readonly path:string){}
  private async locked<T>(signal:AbortSignal|undefined,fn:(rows:Reservation[])=>Promise<T>):Promise<T>{
    await mkdir(dirname(this.path),{recursive:true});
    const lockPath=`${this.path}.lock`,deadline=Date.now()+5000;
    let lock;
    while(!lock){
      signal?.throwIfAborted();
      try{lock=await open(lockPath,"wx");}catch(error){
        if(!(error&&typeof error==="object"&&"code"in error&&error.code==="EEXIST"))throw error;
        if(Date.now()>deadline)throw new EditorError("BUDGET_LOCKED","The evaluation budget is busy; try again later.",503);
        await new Promise(resolve=>setTimeout(resolve,25));
      }
    }
    try{
      let rows:Reservation[]=[];
      try{rows=JSON.parse(await readFile(this.path,"utf8")) as Reservation[];}catch(error){if(!(error&&typeof error==="object"&&"code"in error&&error.code==="ENOENT"))throw error;}
      if(!Array.isArray(rows)||rows.some(r=>!Number.isFinite(r.reservedUsd)||r.reservedUsd<0||!['development','heldout'].includes(r.phase)))throw new EditorError("BUDGET_INVALID","The evaluation ledger requires inspection.",503);
      const result=await fn(rows);
      const temp=`${this.path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(rows));await rename(temp,this.path);
      return result;
    }finally{await lock.close();await unlink(lockPath);}
  }
  async reserve(input:{model:string;amountUsd:number;phase:Phase;signal:AbortSignal}):Promise<string>{
    return this.locked(input.signal,async rows=>{
      if(!Number.isFinite(input.amountUsd)||input.amountUsd<0)throw new EditorError("BUDGET_INVALID","Invalid cost reservation.");
      const cost=(r:Reservation)=>r.settled&&r.actualUsd!==null?r.actualUsd:r.reservedUsd;
      const total=rows.reduce((sum,r)=>sum+cost(r),0),phase=rows.filter(r=>r.phase===input.phase).reduce((sum,r)=>sum+cost(r),0);
      if(total+input.amountUsd>25||phase+input.amountUsd>(input.phase==="development"?15:10))throw new EditorError("BUDGET_EXHAUSTED","The approved evaluation budget cannot cover another call.",429);
      const id=randomUUID();rows.push({id,model:input.model,phase:input.phase,reservedUsd:input.amountUsd,actualUsd:null,settled:false,createdAt:new Date().toISOString()});return id;
    });
  }
  async settle(id:string,actualUsd:number|null):Promise<void>{
    await this.locked(undefined,async rows=>{
      const row=rows.find(r=>r.id===id);if(!row)throw new EditorError("BUDGET_INVALID","Reservation not found.");
      if(actualUsd!==null&&(!Number.isFinite(actualUsd)||actualUsd<0))throw new EditorError("BUDGET_INVALID","Invalid reported usage.");
      if(row.settled)return;
      row.actualUsd=actualUsd;row.settled=true;
    });
  }
}
