// Isolated transactional test adapter. Never connects to PostgreSQL or Redis.
export class MemoryDatabase {
  sessions=new Map<string,any>();messages:any[]=[];failWrite=false;casFailures=0;tail=Promise.resolve();
  constructor(){this.sessions.set('s',{id:'s',userId:'u',documentTypeId:'invoice',templateId:'t',status:'ACTIVE',slots:{},expiresAt:null});}
  documentType={findUnique:async({where}:any)=>({id:where.id,name:where.id}),upsert:async({create}:any)=>create};
  template={findUnique:async({where}:any)=>({id:where.id,documentTypeId:where.id==='t'?'invoice':where.id.includes('purchase_order')?'purchase_order':where.id.split('_')[1]}),upsert:async({create}:any)=>create};
  chatSession={
    create:async({data}:any)=>{if(this.sessions.has(data.id))throw new Error('Duplicate session');const session={...structuredClone(data),expiresAt:data.expiresAt||null};this.sessions.set(data.id,session);return structuredClone(session);},
    findUnique:async({where}:any)=>structuredClone(this.sessions.get(where.id)||null),
    updateMany:async({where,data}:any)=>{
      if(this.failWrite)throw new Error('Synthetic write failure');
      if(this.casFailures>0){this.casFailures--;return {count:0};}
      const session=this.sessions.get(where.id);if(!session||session.userId!==where.userId||JSON.stringify(session.slots)!==JSON.stringify(where.slots.equals))return {count:0};
      this.sessions.set(where.id,{...session,...structuredClone(data)});return {count:1};
    },
  };
  chatMessage={
    create:async({data}:any)=>{if(this.messages.some(m=>m.id===data.id))throw new Error('Duplicate message');const value={...data,createdAt:new Date()};this.messages.push(value);return value;},
    findMany:async({where,take}:any)=>this.messages.filter(m=>m.sessionId===where.sessionId&&(!where.flaggedPromptInjection||!m.flaggedPromptInjection)&&m.flaggedPromptInjection!==true).slice(-(take||100)).map(m=>structuredClone(m)),
  };
  async $transaction<T>(action:(tx:any)=>Promise<T>):Promise<T>{
    let unlock!:()=>void;const prior=this.tail;this.tail=new Promise(resolve=>unlock=resolve);await prior;
    const before=structuredClone(this.sessions),messages=structuredClone(this.messages);
    try{return await action(this);}catch(error){this.sessions=before;this.messages=messages;throw error;}finally{unlock();}
  }
}
