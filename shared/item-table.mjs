import {documentData, validField} from './document-contract.mjs';

// A pasted table already declares each numeric role. Import it as structured
// user data; free-form service descriptions still use AI extraction.
export function extractItemTable(message) {
    const lines=message.trim().replace(/^```(?:text|tsv|markdown)?\s*\n|\n```$/g,'').split(/\r?\n/).filter(line=>line.trim());
    if(lines.length<2)return undefined;
    const delimiter=lines[0].includes('\t')?'\t':lines[0].includes('|')?'|':undefined;
    if(!delimiter)return undefined;
    const cells=line=>{
        const text=delimiter==='|'?line.trim().replace(/^\|\s*|\s*\|$/g,''):line;
        return text.split(delimiter).map(cell=>cell.trim());
    };
    const header=cells(lines[0]);
    const labels=header.map(cell=>cell.toLowerCase().replace(/\([a-z]{3}\)/g,'').replace(/[^a-z]/g,''));
    const roles=labels.map(label=>['itemservice','item','service','description','itemdescription'].includes(label)?'description':['quantity','qty'].includes(label)?'quantity':['unitprice','price','rate'].includes(label)?'unitPrice':['total','amount','linetotal'].includes(label)?'total':undefined);
    if(roles.some(role=>!role)||new Set(roles).size!==roles.length||!['description','quantity','unitPrice'].every(role=>roles.includes(role)))return undefined;
    const currencies=[...new Set(header.flatMap(cell=>[...cell.matchAll(/\(([A-Za-z]{3})\)/g)].map(match=>match[1].toUpperCase())))];
    if(currencies.length>1||currencies.some(value=>!validField('currency',value)))return undefined;
    const currency=currencies[0];
    const number=value=>/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)?Number(value.replace(/,/g,'')):NaN;
    const items=[];
    for(const line of lines.slice(1)) {
        const row=cells(line);
        if(delimiter==='|'&&row.length===header.length&&row.every(cell=>/^:?-{3,}:?$/.test(cell)))continue;
        if(row.length!==header.length)return undefined;
        const item={description:row[roles.indexOf('description')],quantity:number(row[roles.indexOf('quantity')]),unitPrice:number(row[roles.indexOf('unitPrice')])};
        if(!validField('lineItems',[item]))return undefined;
        if(roles.includes('total')) {
            const total=number(row[roles.indexOf('total')]);
            // Without currency, do not guess a rounding convention for a table
            // with supplied amounts. Its semantic extraction needs clarification.
            if(!currency||total!==documentData({currency,lineItems:[item]}).lineItems[0].total)return undefined;
        }
        items.push(item);
    }
    if(!validField('lineItems',items))return undefined;
    return {lineItems:items,...(currency?{currency}:{})};
}
