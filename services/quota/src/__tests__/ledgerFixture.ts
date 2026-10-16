/** Isolated adapter for ledger behavior tests. Real PostgreSQL locking is tested by the stack harness. */
export class LedgerFixture {
  now=new Date('2026-10-16T23:50:00Z');
  windows=new Map<string,any>();receipts=new Map<string,any>();quotas=new Map<string,any>();
  private tail=Promise.resolve();
  reset(){this.windows.clear();this.receipts.clear();this.quotas.clear();this.now=new Date('2026-10-16T23:50:00Z');}
  $executeRaw=async()=>0;
  $queryRaw=async()=>[{now:this.now}];
  quotaWindow={
    findUnique:async({where}:any)=>this.windows.get(where.userId)||null,
    upsert:async({where,create,update}:any)=>{const row=this.windows.has(where.userId)?{...this.windows.get(where.userId),...update}:create;this.windows.set(where.userId,row);return row;},
    update:async({where,data}:any)=>{const row={...this.windows.get(where.userId),...data};this.windows.set(where.userId,row);return row;},
  };
  quotaReservation={
    findUnique:async({where}:any)=>this.receipts.get(where.id)||null,
    create:async({data}:any)=>{if(this.receipts.has(data.id))throw new Error('duplicate');const row={...data,refundedAt:null};this.receipts.set(data.id,row);return row;},
    update:async({where,data}:any)=>{const row={...this.receipts.get(where.id),...data};this.receipts.set(where.id,row);return row;},
    updateMany:async({where,data}:any)=>{for(const [id,row] of this.receipts)if(row.userId===where.userId&&row.day===where.day&&!row.refundedAt)this.receipts.set(id,{...row,...data});return{count:1};},
  };
  quota={upsert:async({where,create,update}:any)=>{const row=this.quotas.has(where.userId)?{...this.quotas.get(where.userId),...update}:create;this.quotas.set(where.userId,row);return row;}};
  async $transaction<T>(run:(tx:any)=>Promise<T>):Promise<T>{
    const prior=this.tail;let release!:()=>void;this.tail=new Promise<void>(resolve=>{release=resolve;});await prior;
    const snapshot=[structuredClone(this.windows),structuredClone(this.receipts),structuredClone(this.quotas)];
    try{return await run(this);}catch(error){[this.windows,this.receipts,this.quotas]=snapshot;throw error;}finally{release();}
  }
}
