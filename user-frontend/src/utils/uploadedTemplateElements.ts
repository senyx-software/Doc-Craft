import type {InvoiceElement,TextElement} from '../types/canvasElement';
import {contract,documentData,validField,formatDocumentMoney} from '../../../shared/document-contract.mjs';
import {formatDate} from '../../../shared/field-processing.mjs';

type BoundElement=InvoiceElement&{binding?:string};
export interface EditableTemplateDefinition {
  version:1;
  pageWidth:number;
  pageHeight:number;
  pageCount:number;
  elements:BoundElement[];
  items?:{x:number;y:number;w:number;rowHeight:number;quantityX:number;rateX:number;amountX:number;fontSize:number}|null;
}
const definitions=new Map<string,EditableTemplateDefinition>();
export function clearUploadedDefinitions(){definitions.clear();}
export function registerUploadedDefinition(id:string,definition:EditableTemplateDefinition){
  if(definition.version!==1||!Array.isArray(definition.elements)||definition.elements.length>1000)throw new Error('Unsupported editable template definition');
  definitions.set(id,definition);
}
export function uploadedDefinition(id:string){return definitions.get(id);}

export function uploadedTemplateElements(id:string,raw:Record<string,unknown>):InvoiceElement[]|null {
  const definition=definitions.get(id);if(!definition)return null;
  const data=documentData(raw);
  const amounts=new Set(['subtotal','totalDue','taxAmount','discountAmount']);
  const money=(value:number|undefined)=>value===undefined||!validField('currency',data.currency)?'':(data.currencySymbol||'')+formatDocumentMoney(value,data);
  const items=definition.items;
  const rows=validField('lineItems',data.lineItems)?data.lineItems:[];
  const shift=Math.max(0,rows.length-1)*(items?.rowHeight||0);
  const elements:InvoiceElement[]=definition.elements.map(base=>{
    const {binding,...element}=base;
    if(items&&element.y>items.y+items.rowHeight)element.y+=shift;
    if(binding&&element.type==='text'){
      const value=data[binding];
      element.text=amounts.has(binding)?money(value):typeof value==='string'||typeof value==='number'?String(value):'';
      if(['issueDate','dueDate'].includes(binding)&&validField(binding,value))element.text=formatDate(String(value),data.dateFormat);
      if(Object.hasOwn(contract.fields,binding))element.semanticField=binding;
    }
    return element;
  });
  if(items)rows.forEach((item:{description:string;quantity:number;unitPrice:number;total:number},index:number)=>{
    const values:Array<[string,number,number,string,'left'|'right']>=[['name',items.x,Math.max(80,items.quantityX-items.x-12),item.description,'left'],['qty',items.quantityX,35,String(item.quantity),'right'],['rate',items.rateX,55,money(item.unitPrice),'right'],['amount',items.amountX,55,money(item.total),'right']];
    for(const [suffix,x,w,text,align] of values)elements.push({id:`item_${index}_${suffix}`,type:'text',text,x,y:items.y+index*items.rowHeight,w,h:18,fontSize:items.fontSize,fontWeight:400,fontFamily:'Arial',color:'#222222',align,zIndex:2,section:'items'} satisfies TextElement);
  });
  return elements;
}
