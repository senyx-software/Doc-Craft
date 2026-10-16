import { env } from '../config/env.js';
import { prisma,paymentDatabase } from '../db/prisma.js';
import { paymentTransaction } from '../db/transaction-context.js';
import { activateProSubscription,syncPlanEntitlements,upsertInvoice } from './subscription.service.js';

export const payhereRetrievalConfigured=()=>!!process.env.PAYHERE_APP_ID && !!process.env.PAYHERE_APP_SECRET;
const base=()=>env.PAYHERE_SANDBOX?'https://sandbox.payhere.lk/merchant/v1':'https://www.payhere.lk/merchant/v1';

async function providerJson(path:string,token:string) {
  const response=await fetch(base()+path,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('PayHere trusted retrieval unavailable');
  const result=await response.json() as any;
  if(result.status!==1)throw new Error('PayHere retrieval did not confirm records');
  return result.data;
}

export function providerInstant(value:string,offset=process.env.PAYHERE_PROVIDER_UTC_OFFSET) {
  // Provider examples contain offset-free timestamps. An operator must verify
  // their sandbox's timezone; never interpret them using the host timezone.
  if(!/(Z|[+-]\d\d:\d\d)$/.test(value)) {
    if(!offset || !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset))throw new Error('PAYHERE_PROVIDER_UTC_OFFSET must be verified before recurring reconciliation');
    value=value.replace(' ','T')+offset;
  }
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error('Invalid PayHere payment date');
  return date;
}

export function addBillingPeriod(date:Date,cycle:string) {
  const result=new Date(date),day=result.getUTCDate();result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth()+(cycle==='yearly'?12:1));
  const last=new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate();
  result.setUTCDate(Math.min(day,last));return result;
}

async function payhereAccessToken():Promise<string> {
  if(!payhereRetrievalConfigured())throw new Error('PayHere OAuth App ID and App Secret are required');
  const response=await fetch(base()+'/oauth/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(process.env.PAYHERE_APP_ID+':'+process.env.PAYHERE_APP_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('PayHere OAuth unavailable');
  const auth=await response.json() as any;
  if(typeof auth.access_token!=='string')throw new Error('Invalid PayHere OAuth response');
  return auth.access_token;
}

/** Cancel only a mandate resolved from trusted merchant data for this owned order. */
export async function cancelPayhereOrder(orderId:string) {
  const snapshot=await retrievePayhereOrder(orderId);
  if(snapshot.subscription.status!=='ACTIVE')return;
  const token=await payhereAccessToken();
  const response=await fetch(base()+'/subscription/cancel',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({subscription_id:snapshot.subscription.subscription_id}),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('PayHere cancellation could not be confirmed');
  const result=await response.json() as any;
  if(result.status!==1)throw new Error('PayHere cancellation was not confirmed; retry reconciliation');
}

/** Every provider ID comes from OAuth-protected data, never from callback hints. */
export async function retrievePayhereOrder(orderId:string) {
  const auth={access_token:await payhereAccessToken()};
  const subscriptions=await providerJson('/subscription',auth.access_token);
  if(!Array.isArray(subscriptions))throw new Error('Invalid PayHere subscription response');
  const matches=subscriptions.filter(item=>item.order_id===orderId);
  if(matches.length!==1)throw new Error('PayHere recurring identity is missing or ambiguous');
  const subscription=matches[0],id=String(subscription.subscription_id);
  if(!/^\d{1,30}$/.test(id))throw new Error('Invalid trusted subscription identity');
  const payments=await providerJson('/subscription/'+id+'/payments',auth.access_token);
  if(!Array.isArray(payments)||payments.length>10000)throw new Error('Invalid payment history');
  return {subscription,payments};
}

export async function reconcilePayhereOrder(orderId:string) {
  const snapshot=await retrievePayhereOrder(orderId);
  const apply=async()=>{
    const intent=await prisma.checkoutIntent.findUnique({where:{orderId}});
    if(!intent)throw new Error('No owned PayHere checkout intent');
    const plan=await prisma.plan.findUnique({where:{id:intent.planId}});
    if(!plan)throw new Error('Unknown checkout plan');
    if(snapshot.subscription.currency!==intent.currency || Math.round(Number(snapshot.subscription.amount)*100)!==intent.amountMinor)throw new Error('Trusted recurring mandate differs from checkout');
    const payments=snapshot.payments.map(item=>{
      if(item.order_id!==orderId || item.currency!==intent.currency || !/^\d{1,30}$/.test(String(item.payment_id)) || Math.round(Number(item.amount)*100)!==intent.amountMinor || !['RECEIVED','REFUNDED','CHARGEBACKED','REFUND REQUESTED','REFUND PROCESSING'].includes(item.status))throw new Error('Trusted installment does not match checkout');
      return {...item,id:String(item.payment_id),at:providerInstant(item.date)};
    }).sort((a,b)=>a.at.getTime()-b.at.getTime());
    if(!payments.length || new Set(payments.map(item=>item.id)).size!==payments.length)throw new Error('Missing or duplicated trusted installment');
    const current=await prisma.subscription.findUnique({where:{userId:intent.userId}});
    const currentIntent=current?.payhereOrderId ? await prisma.checkoutIntent.findUnique({where:{orderId:current.payhereOrderId}}) : null;
    const stale=current && (current.currentPeriodStart>intent.createdAt || currentIntent && currentIntent.createdAt>intent.createdAt);
    const latest=payments.filter(item=>!['REFUNDED','CHARGEBACKED'].includes(item.status)).at(-1);
    if(!stale && latest)await activateProSubscription({userId:intent.userId,planId:plan.id,planName:plan.name,gateway:'payhere',payhereOrderId:orderId,payhereSubscriptionId:String(snapshot.subscription.subscription_id),periodStart:latest.at,periodEnd:addBillingPeriod(latest.at,intent.billingCycle),billingAmountMinor:intent.amountMinor,billingCurrency:intent.currency,billingCycle:intent.billingCycle as 'monthly'|'yearly'});
    const sub=await prisma.subscription.findUnique({where:{userId:intent.userId}});
    if(!sub)throw new Error('Payment subscription predecessor is missing');
    // Convert the legacy single-charge invoice to the first trusted installment,
    // preventing double-counting the callback and Retrieval API representations.
    const initial=await prisma.billingInvoice.findUnique({where:{gatewayInvoiceId:'payhere:'+orderId}});
    if(initial)await prisma.billingInvoice.update({where:{id:initial.id},data:{gatewayInvoiceId:'payhere:payment:'+payments[0].id}});
    for(const item of payments)await upsertInvoice({userId:intent.userId,subscriptionId:sub.id,gateway:'payhere',gatewayInvoiceId:'payhere:payment:'+item.id,amount:intent.amountMinor/100,currency:intent.currency,status:['REFUNDED','CHARGEBACKED'].includes(item.status)?'refunded':'paid',paidAt:item.at});
    if(!stale) {
      if(!latest)await prisma.subscription.update({where:{id:sub.id},data:{status:'cancelled',cancelAtPeriodEnd:false}});
      else if(snapshot.subscription.status!=='ACTIVE')await prisma.subscription.update({where:{id:sub.id},data:{cancelAtPeriodEnd:true}});
      await syncPlanEntitlements(intent.userId,latest?plan.name:'free');
    }
  };
  if(paymentTransaction.getStore())await apply();
  else await paymentDatabase.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(48070001)`;
    await paymentTransaction.run({tx,eventId:'payhere-reconcile:'+orderId,sequence:0},apply);
  },{timeout:15000,maxWait:10000});
  return {reconciled:true,orderId};
}
