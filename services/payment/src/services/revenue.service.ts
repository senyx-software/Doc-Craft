/** Separate monetary aggregates by their recorded currency; never invent FX. */
export function summarizeRevenue(subscriptions: Array<{billingAmountMinor:number|null;billingCurrency:string|null;billingCycle:string|null;gateway:string;plan:{name:string}}>, invoices:Array<{currency:string;amount:number;status?:string}>,adjustments:Array<{currency:string;amountMinor:number;invoiceId?:string}>=[]) {
  const byCurrency:Record<string,{mrr:number;arr:number;active_subscriptions:number;total_revenue_paid:number;total_invoices_paid:number;refunds:number;net_collected:number;revenue_by_gateway:Record<string,number>;revenue_by_plan:Record<string,number>}>={};
  const group=(currency:string)=>byCurrency[currency]??=( {mrr:0,arr:0,active_subscriptions:0,total_revenue_paid:0,total_invoices_paid:0,refunds:0,net_collected:0,revenue_by_gateway:{},revenue_by_plan:{}} );
  group('USD');group('LKR');
  let unknown=0;
  for(const sub of subscriptions) {
    if(sub.billingAmountMinor===null || !Number.isSafeInteger(sub.billingAmountMinor) || sub.billingAmountMinor<0 || !['USD','LKR'].includes(sub.billingCurrency||'') || !['monthly','yearly'].includes(sub.billingCycle||'')){unknown++;continue;}
    const revenue=group(sub.billingCurrency!);
    revenue.active_subscriptions++;
    const monthly=sub.billingAmountMinor/100/(sub.billingCycle==='yearly'?12:1);
    revenue.mrr+=monthly;revenue.arr+=monthly*12;
    revenue.revenue_by_gateway[sub.gateway]=(revenue.revenue_by_gateway[sub.gateway]||0)+monthly;
    revenue.revenue_by_plan[sub.plan.name]=(revenue.revenue_by_plan[sub.plan.name]||0)+monthly;
  }
  for(const invoice of invoices) {
    if(!Number.isFinite(invoice.amount)||!['USD','LKR'].includes(invoice.currency))continue;
    const revenue=group(invoice.currency);
    revenue.total_revenue_paid+=invoice.amount;revenue.total_invoices_paid++;
  }
  for(const adjustment of adjustments) {
    if(Number.isSafeInteger(adjustment.amountMinor) && adjustment.amountMinor>=0 && ['USD','LKR'].includes(adjustment.currency))group(adjustment.currency).refunds+=adjustment.amountMinor/100;
  }
  for(const invoice of invoices)if(invoice.status==='refunded' && ['USD','LKR'].includes(invoice.currency) && !adjustments.some(item=>!!item.invoiceId && item.invoiceId===(invoice as any).id))group(invoice.currency).refunds+=invoice.amount;
  for(const revenue of Object.values(byCurrency)) {
    revenue.net_collected=revenue.total_revenue_paid-revenue.refunds;
    for(const name of ['mrr','arr','total_revenue_paid','refunds','net_collected'] as const)revenue[name]=Math.round((revenue[name]+Number.EPSILON)*100)/100;
  }
  return {by_currency:byCurrency,unreconciled_subscription_count:unknown};
}
