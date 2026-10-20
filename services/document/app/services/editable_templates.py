"""Derive blank, data-bound canvas layouts from reviewed uploads.

The immutable reviewed source remains unchanged. PDF values are discarded;
only recognized labels, lines and blank document fields enter the canvas.
OCR runs locally, without sending uploaded documents to an external provider.
"""
import base64
from collections import Counter
from functools import lru_cache
from html import escape
from io import BytesIO
import json
import math
import os
from pathlib import Path
import re

import pymupdf
from PIL import Image

from shared.safe_template import validate_template,FIELDS
from app.services.document_contract import CONTRACT,valid_field,calculate_document_data
from app.services.pdf_runtime import run_pdf_task

WIDTH,HEIGHT=595,842
LABELS={
    'invoice number':('invoiceNumber','inline'),'invoice no':('invoiceNumber','inline'),
    'quotation number':('invoiceNumber','inline'),'quote number':('invoiceNumber','inline'),
    'receipt number':('invoiceNumber','inline'),'purchase order number':('invoiceNumber','inline'),
    'date of issue':('issueDate','inline'),'invoice date':('issueDate','inline'),'issue date':('issueDate','inline'),
    'date due':('dueDate','inline'),'due date':('dueDate','inline'),
    'bill to':('clientName','block'),'billed to':('clientName','block'),'recipient':('clientName','block'),
    'ship to':('clientName','block'),'from':('businessName','sender'),'sender':('businessName','sender'),
    'subtotal':('subtotal','total'),'total':('totalDue','total'),'amount due':('totalDue','total'),
    'tax':('taxAmount','total'),'discount':('discountAmount','total'),
    'notes':('notesAndTerms','below'),'terms and conditions':('notesAndTerms','below'),
    'payment address':('accountDetails','below'),'account data':('accountDetails','below'),
    'bank details':('accountDetails','below'),'payment details':('accountDetails','below'),
    'subject':('subject','below'),'reference':('referenceNumber','inline'),
    'description':(None,'items'),'item description':(None,'items'),'item':(None,'items'),
    'qty':(None,'quantity'),'quantity':(None,'quantity'),'unit price':(None,'rate'),'rate':(None,'rate'),
    'amount':(None,'amount'),'invoice':(None,'title'),'quotation':(None,'title'),
    'receipt':(None,'title'),'proposal':(None,'title'),'purchase order':(None,'title'),
}
PHRASES=sorted(LABELS,key=lambda value:-len(value.split()))


def _text(identity,text,x,y,w=160,h=16,size=10,color='#222222',weight=400,section='meta',binding=None):
    if text:
        units=sum(.85 if char in 'mwMW@' else .25 if char in "il1.,:;!'" else .28 if char.isspace() else .65 if char.isupper() else .52 for char in text)
        size=min(size,max(7,(w-3)/max(1,units)))
    value={'id':identity,'type':'text','text':text,'x':round(x,2),'y':round(y,2),'w':round(max(12,w),2),'h':round(max(12,h),2),
        'fontSize':round(max(7,min(size,40)),2),'fontWeight':weight,'fontFamily':'Arial','color':color,'align':'left','section':section,'zIndex':2}
    if binding:value['binding']=binding
    return value


def _normal(value):return re.sub(r'[^a-z0-9]+',' ',value.lower()).strip()


def _word_rows(words):
    rows=[]
    for word in sorted(words,key=lambda word:((word[1]+word[3])/2,word[0])):
        center=(word[1]+word[3])/2
        row=next((row for row in reversed(rows[-4:]) if abs(row[0]-center)<3),None)
        if row:row[1].append(word)
        else:rows.append([center,[word]])
    return [sorted(row[1],key=lambda word:word[0]) for row in rows]


def _ink(image,box):
    x0,y0,x1,y1=[max(0,round(value)) for value in box]
    crop=image.crop((x0,y0,max(x0+1,x1),max(y0+1,y1))).convert('RGB')
    colors=Counter(pixel for pixel in getattr(crop,'get_flattened_data',crop.getdata)() if max(pixel)-min(pixel)>45 or max(pixel)<140)
    pixel=min(colors,key=sum) if colors else (34,34,34)
    return '#'+''.join(f'{channel:02x}' for channel in pixel)


def _rules(image,offset):
    """Long solid runs are layout rules/bands, rather than invoice text."""
    result=[]
    for vertical in (False,True):
        raster=image.transpose(Image.Transpose.TRANSPOSE) if vertical else image
        width,height=raster.size
        pixels=raster.load();runs=[]
        for y in range(height):
            start=None
            for x in range(width+1):
                pixel=pixels[x,y] if x<width else (255,255,255)
                ink=max(pixel)<205 or max(pixel)-min(pixel)>60
                if ink and start is None:start=x
                if not ink and start is not None:
                    if x-start>width*.35:runs.append((start,x,y,pixels[(start+x)//2,y]))
                    start=None
        groups=[]
        for start,end,y,color in runs:
            previous=groups[-1] if groups else None
            if previous and abs(previous[0]-start)<3 and abs(previous[1]-end)<3 and y<=previous[3]+1:
                previous[3]=y
            else:groups.append([start,end,y,y,color])
        for start,end,y0,y1,color in groups[:100]:
            x,y,w,h=(y0,start,y1-y0+1,end-start) if vertical else (start,y0,end-start,y1-y0+1)
            result.append({'id':f'upl_rule_{offset}_{len(result)}','type':'rect','x':x,'y':y+offset,'w':w,'h':h,
                'fill':'#'+''.join(f'{channel:02x}' for channel in color),'zIndex':0,'section':'custom'})
    return result[:150]


def _pdf_page(image,index):
    image=image.convert('RGB')
    raster=BytesIO();image.save(raster,format='PNG')
    local=Path(__file__).resolve().parents[4]/'.local/tessdata'
    tessdata=os.getenv('TESSDATA_PREFIX') or (str(local) if (local/'eng.traineddata').exists() else None)
    try:
        with pymupdf.open() as document:
            page=document.new_page(width=WIDTH,height=HEIGHT)
            page.insert_image(page.rect,stream=raster.getvalue())
            textpage=page.get_textpage_ocr(tessdata=tessdata,dpi=150,full=True)
            words=page.get_text('words',textpage=textpage)
    except Exception as error:
        raise ValueError('PDF editing needs OCR language data. Run python scripts/setup_template_ocr.py on the document server.') from error
    if len(words)>2500:raise ValueError('This PDF page is too complex for the editable template limit.')
    return layout_from_pdf_words(image,words,index)


def layout_from_pdf_words(image,words,index):
    """Keep layout labels and bindings; never retain the recognized PDF values."""
    image=image.resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS)
    offset=index*HEIGHT;elements=_rules(image,offset);labels=[]
    for row in _word_rows(words):
        tokens=[_normal(word[4]) for word in row]
        cursor=0
        while cursor<len(row):
            phrase=next((phrase for phrase in PHRASES if tokens[cursor:cursor+len(phrase.split())]==phrase.split()),None)
            if not phrase:cursor+=1;continue
            count=len(phrase.split());group=row[cursor:cursor+count]
            x,y,right,bottom=min(w[0] for w in group),min(w[1] for w in group),max(w[2] for w in group),max(w[3] for w in group)
            field,mode=LABELS[phrase]
            # A document title inside "Invoice number" is consumed by the longer label.
            size=min((bottom-y)*.85,20 if mode=='title' else 10);color=_ink(image,(x,y,right,bottom))
            label=_text(f'upl_static_{index}_{len(labels)}',' '.join(w[4] for w in group).rstrip(':'),x,y+offset,max(180,right-x+6) if mode=='title' else right-x+6,bottom-y+3,size,color,700 if mode=='title' else 500)
            elements.append(label)
            labels.append({'label':label,'field':field,'mode':mode,'phrase':phrase,'following':row[cursor+count:]})
            cursor+=count

    bound=set()
    def bind(field,x,y,w=150,h=16,size=10,section='meta'):
        identity=f'upl_field_{field}_{index}_{len(elements)}'
        element=_text(identity,'',x,y+offset,w,h,size,section=section,binding=field)
        if field in ('subtotal','totalDue','taxAmount','discountAmount'):element['align']='right'
        elements.append(element);bound.add(field)

    blocks=[item for item in labels if item['mode']=='block']
    for item in labels:
        label=item['label'];x,y,w,h=label['x'],label['y']-offset,label['w'],label['h'];field=item['field'];mode=item['mode']
        if not field:continue
        if mode=='inline':
            following=[word for word in item['following'] if word[0]>x+w-6 and word[0]<x+w+180]
            start=following[0][0] if following else min(x+w+8,WIDTH-150)
            bind(field,start,y,min(180,WIDTH-start-24),h,label['fontSize'])
        elif mode=='total':
            start=max(x+w+12,WIDTH-135)
            bind(field,start,y,WIDTH-start-28,h,label['fontSize'],'totals')
        elif mode in ('block','sender'):
            right=min([other['label']['x']-10 for other in blocks if other['label']['x']>x+30]+[WIDTH-28])
            width=max(100,right-x)
            bind(field,x,y+h+3,width,16,10,'client' if mode=='block' else 'header')
            address='clientAddress' if field=='clientName' else 'senderAddress'
            bind(address,x,y+h+21,width,54,9,'client' if mode=='block' else 'header')
            email='clientEmail' if field=='clientName' else 'senderEmail'
            bind(email,x,y+h+77,width,16,9,'client' if mode=='block' else 'header')
        elif mode=='below':bind(field,x,y+h+5,min(280,WIDTH-x-30),60,9,'notes')
    if blocks and 'businessName' not in bound:
        first=min(blocks,key=lambda item:item['label']['x'])['label']
        if first['x']>130:
            y=first['y']-offset
            bind('businessName',30,y,max(120,first['x']-45),16,11,'header')
            bind('senderAddress',30,y+18,max(120,first['x']-45),54,9,'header')
            bind('senderEmail',30,y+75,max(120,first['x']-45),16,9,'header')
    items_label=next((item['label'] for item in labels if item['mode']=='items'),None)
    items=None
    if items_label:
        column=lambda mode,fallback:next((item['label']['x'] for item in labels if item['mode']==mode and abs(item['label']['y']-items_label['y'])<18),fallback)
        items={'x':items_label['x'],'y':items_label['y']+20,'w':WIDTH-items_label['x']-28,'rowHeight':24,
            'quantityX':column('quantity',WIDTH-165),'rateX':column('rate',WIDTH-115),'amountX':column('amount',WIDTH-65),'fontSize':9}
    return elements,items,bound


def _html_layout(source):
    safe=validate_template(source['html'],source['assets'])['validated_html']
    # Placeholders become identifiable words while measuring the reviewed HTML.
    safe=re.sub(r'{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}',lambda match:'DC_'+match[1]+'_ZZ',safe)
    output=BytesIO();writer=pymupdf.DocumentWriter(output)
    def rectangle(number,filled):
        if number>=6:raise ValueError('An editable template can contain at most six pages.')
        return pymupdf.Rect(0,0,WIDTH,HEIGHT),pymupdf.Rect(24,24,WIDTH-24,HEIGHT-24),None
    try:pymupdf.Story(safe).write(writer,rectangle)
    finally:writer.close()
    elements=[];items=None
    with pymupdf.open(stream=output.getvalue(),filetype='pdf') as document:
        for index,page in enumerate(document):
            offset=index*HEIGHT
            for block in page.get_text('dict')['blocks']:
                if block['type']==1:
                    x,y,right,bottom=block['bbox']
                    elements.append({'id':f'upl_image_{len(elements)}','type':'image','x':x,'y':y+offset,'w':right-x,'h':bottom-y,
                        'src':'data:image/'+block['ext']+';base64,'+base64.b64encode(block['image']).decode(),'zIndex':1,'section':'header'})
                    continue
                for line in block.get('lines',[]):
                    for span in line['spans']:
                        text=span['text'];x,y,right,bottom=span['bbox'];cursor=x
                        for token in re.split(r'(DC_[A-Za-z][A-Za-z0-9]*_ZZ)',text):
                            if not token:continue
                            width=(right-x)*len(token)/max(1,len(text))
                            match=re.fullmatch(r'DC_([A-Za-z][A-Za-z0-9]*)_ZZ',token)
                            binding=match[1] if match and match[1] in FIELDS else None
                            if binding=='lineItems':
                                items={'x':cursor,'y':y+offset,'w':WIDTH-cursor-30,'rowHeight':24,'quantityX':WIDTH-175,'rateX':WIDTH-120,'amountX':WIDTH-65,'fontSize':10}
                            else:
                                identity=f'upl_field_{binding}_{len(elements)}' if binding else f'upl_static_html_{len(elements)}'
                                color=f"#{span['color']:06x}"
                                elements.append(_text(identity,'' if binding else token,cursor,y+offset,max(140,width) if binding else width+4,bottom-y,span['size'],color,700 if span['flags']&16 else 400,binding=binding))
                            cursor+=width
        count=len(document)
    return {'version':1,'pageWidth':WIDTH,'pageHeight':HEIGHT,'pageCount':max(1,count),'elements':elements,'items':items}


@lru_cache(maxsize=24)
def _definition(encoded,document_type):
    source=json.loads(encoded)
    assets=source.get('assets',{})
    if assets and all(re.fullmatch(r'pdf_page_[1-6]',key) for key in assets):
        validated=validate_template(source['html'],assets)
        elements=[];items=None;bound=set()
        for index,(_,data) in enumerate(sorted(validated['assets'].items())):
            with Image.open(BytesIO(base64.b64decode(data.split(',')[1]))) as image:
                page_elements,page_items,page_bound=_pdf_page(image,index)
            elements.extend(page_elements);items=items or page_items;bound.update(page_bound)
        # Essential editable slots remain available even when the PDF uses unfamiliar labels.
        fallback={'businessName':(30,150,180,18),'clientName':(240,165,160,18),'invoiceNumber':(110,100,150,16),
            'issueDate':(110,118,150,16),'dueDate':(110,136,150,16),'notesAndTerms':(30,650,360,60)}
        for field,(x,y,w,h) in fallback.items():
            if field not in bound:elements.append(_text('upl_field_'+field+'_fallback','',x,y,w,h,binding=field,section='notes' if field=='notesAndTerms' else 'meta'))
        if not items:items={'x':30,'y':400,'w':535,'rowHeight':24,'quantityX':400,'rateX':455,'amountX':525,'fontSize':10}
        result={'version':1,'pageWidth':WIDTH,'pageHeight':HEIGHT,'pageCount':len(assets),'elements':elements,'items':items}
    else:result=_html_layout(source)
    for page in range(1,result['pageCount']):
        result['elements'].append({'id':f'upl_page_{page}','type':'rect','x':0,'y':page*HEIGHT+1,'w':1,'h':1,'fill':'#ffffff','zIndex':0,'section':'custom'})
    if len(result['elements'])>1000:raise ValueError('This template is too complex for the editable canvas.')
    return result


def editable_definition(source,document_type):
    return run_pdf_task(_definition,json.dumps(source,sort_keys=True,separators=(',',':')),document_type)


def bind_elements(definition,raw):
    if not isinstance(raw,dict):raise ValueError('Document fields must be an object.')
    data={key:value for key,value in raw.items() if valid_field(key,value)}
    data=calculate_document_data(data)
    monetary={'subtotal','totalDue','taxAmount','discountAmount'}
    currency=data.get('currency')
    def money(value):
        if not isinstance(value,(int,float)) or isinstance(value,bool) or not math.isfinite(value) or not currency:return ''
        from app.services.sidecar import format_money
        symbol=CONTRACT['formatting']['currencySymbols'].get(currency,currency+' ')
        return symbol+format_money(value,currency,data.get('locale','en-US'))
    items=definition.get('items');line_items=data.get('lineItems',[])
    shift=max(0,len(line_items)-1)*(items['rowHeight'] if items else 0)
    elements=[]
    for base in definition['elements']:
        element={key:value for key,value in base.items() if key!='binding'}
        field=base.get('binding')
        if field:
            value=data.get(field,'')
            element['text']=money(value) if field in monetary else str(value) if isinstance(value,(str,int,float)) else ''
            if field in ('issueDate','dueDate') and value and data.get('dateFormat') in ('DD/MM/YYYY','MM/DD/YYYY'):
                year,month,day=value.split('-')
                element['text']=f'{day}/{month}/{year}' if data['dateFormat']=='DD/MM/YYYY' else f'{month}/{day}/{year}'
            if field in CONTRACT['fields']:element['semanticField']=field
        if items and element['y']>items['y']+items['rowHeight']:element['y']+=shift
        elements.append(element)
    if items:
        for index,item in enumerate(line_items):
            y=items['y']+index*items['rowHeight']
            for suffix,x,width,value,align in [('name',items['x'],max(80,items['quantityX']-items['x']-12),item['description'],'left'),
                    ('qty',items['quantityX'],35,str(item['quantity']),'right'),('rate',items['rateX'],55,money(item['unitPrice']),'right'),('amount',items['amountX'],55,money(item.get('total')),'right')]:
                element=_text(f'item_{index}_{suffix}',value,x,y,width,18,items['fontSize'],section='items');element['align']=align;elements.append(element)
    return elements


def render_editable_html(definition,slots):
    elements=bind_elements(definition,slots);pages=[]
    count=max(definition['pageCount'],math.ceil(max([element['y']+element['h'] for element in elements]+[HEIGHT])/HEIGHT))
    for page in range(count):
        content=[]
        for element in elements:
            if not page*HEIGHT<=element['y']<(page+1)*HEIGHT:continue
            style=f"position:absolute;left:{element['x']}px;top:{element['y']-page*HEIGHT}px;width:{element['w']}px;height:{element['h']}px;"
            if element['type']=='text':
                style+=f"font-family:Arial;font-size:{element['fontSize']}px;font-weight:{element['fontWeight']};color:{element['color']};text-align:{element['align']};white-space:pre-wrap;overflow-wrap:break-word;"
                content.append('<div style="'+style+'">'+escape(element['text'])+'</div>')
            elif element['type']=='rect':content.append('<div style="'+style+'background-color:'+element['fill']+'"></div>')
            elif element['type']=='image':content.append('<img alt="" style="'+style+'" src="'+escape(element['src'],quote=True)+'">')
        pages.append(f'<div style="position:relative;width:{WIDTH}px;height:{HEIGHT}px;background:white;page-break-after:always">'+''.join(content)+'</div>')
    return '<html><body style="margin:0">'+''.join(pages)+'</body></html>'
