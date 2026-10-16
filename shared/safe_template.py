"""Data-only uploaded templates. No Jinja evaluation, filesystem loader or URL fetches."""
import base64
from html import escape
from html.parser import HTMLParser
from io import BytesIO
import json
from pathlib import Path
import re
from PIL import Image

FIELDS=set(json.loads((Path(__file__).parent/'document-contract.json').read_text())['fields']) | {'subtotal','taxAmount','totalDue','discountAmount','currencySymbol'}
TAGS={'html','head','body','title','div','span','p','h1','h2','h3','h4','br','hr','b','strong','i','em','table','thead','tbody','tfoot','tr','th','td','ul','ol','li','img'}
VOID={'br','hr','img'}
CSS={'color','background-color','font-family','font-size','font-weight','font-style','text-align','text-decoration','white-space','line-height','border','border-top','border-bottom','border-left','border-right','border-collapse','border-spacing','border-color','border-width','border-style','padding','padding-top','padding-bottom','padding-left','padding-right','margin','margin-top','margin-bottom','margin-left','margin-right','width','height','max-width','max-height','min-width','vertical-align','display','table-layout','page-break-before','page-break-after','page-break-inside'}


def assets_data(assets):
    if not isinstance(assets,dict) or len(assets)>6: raise ValueError('At most six embedded raster assets are allowed')
    result={}
    for name,data in assets.items():
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,60}',name) or not isinstance(data,str) or len(data)>200000: raise ValueError('Invalid asset')
        match=re.fullmatch(r'data:image/(png|jpeg);base64,([a-zA-Z0-9+/=]+)',data)
        if not match: raise ValueError('PNG or JPEG data assets only')
        raw=base64.b64decode(match[2],validate=True)
        with Image.open(BytesIO(raw)) as im:
            if im.format not in ('PNG','JPEG') or im.width*im.height>1048576 or im.width>2048 or im.height>2048: raise ValueError('Asset dimensions exceed limits')
            im.load()
            output=BytesIO();im.convert('RGBA').save(output,format='PNG')
            encoded='data:image/png;base64,'+base64.b64encode(output.getvalue()).decode()
            if len(encoded)>200000:raise ValueError('Canonical raster asset exceeds size limit')
            result[name]=encoded
    return result


class TemplateParser(HTMLParser):
    def __init__(self,assets):
        super().__init__(convert_charrefs=True);self.assets=assets;self.output=[];self.stack=[];self.nodes=0

    def handle_starttag(self,tag,attrs):
        self.nodes+=1
        if tag not in TAGS or self.nodes>2500 or len(self.stack)>30: raise ValueError('Unsupported or excessive HTML')
        safe=[];seen=set()
        for key,value in attrs:
            if key in seen or value is None or '{{' in value or len(value)>2000: raise ValueError('Invalid attribute')
            seen.add(key)
            if key=='style':
                parts=[]
                for rule in value.split(';'):
                    if not rule.strip():continue
                    prop,sep,val=rule.partition(':');prop=prop.strip().lower();val=val.strip()
                    # No escapes, at-rules, URLs, variables, CSS functions or comments.
                    if not sep or prop not in CSS or not re.fullmatch(r'[a-zA-Z0-9 #.,%+\-\s]+',val):raise ValueError('Unsafe CSS')
                    parts.append(prop+':'+val)
                value=';'.join(parts)
            elif tag=='img' and key=='src':
                if not value.startswith('asset:') or value[6:] not in self.assets:raise ValueError('Images must reference an embedded asset')
                value=self.assets[value[6:]]
            elif key in ('colspan','rowspan','width','height'):
                if not re.fullmatch(r'[1-9][0-9]{0,3}',value):raise ValueError('Invalid dimension')
            elif key not in ('alt','title'):raise ValueError('Unsupported attribute')
            safe.append(f' {key}="{escape(value,quote=True)}"')
        self.output.append('<'+tag+''.join(safe)+'>')
        if tag not in VOID:self.stack.append(tag)

    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID:self.handle_endtag(tag)

    def handle_endtag(self,tag):
        if tag in VOID:return
        if not self.stack or self.stack.pop()!=tag:raise ValueError('Unbalanced HTML')
        self.output.append('</'+tag+'>')

    def handle_data(self,data):
        for field in re.findall(r'{{(.*?)}}',data,re.S):
            if field.strip() not in FIELDS:raise ValueError('Unknown field placeholder')
        if '{%' in data or '{#' in data or re.search(r'{{(?!\s*[A-Za-z][A-Za-z0-9]*\s*}})',data):raise ValueError('Template expressions are forbidden')
        self.output.append(escape(data))

    def handle_decl(self,decl):
        if decl.lower()!='doctype html':raise ValueError('Unsupported declaration')

    def handle_comment(self,data):raise ValueError('HTML comments are unsupported')
    def handle_pi(self,data):raise ValueError('Processing instructions are forbidden')
    def unknown_decl(self,data):raise ValueError('Unsupported declaration')


def validate_template(html,assets=None):
    if not isinstance(html,str) or not html.strip() or len(html.encode())>150000:raise ValueError('HTML must be 1–150000 bytes')
    canonical_assets=assets_data(assets or {})
    parser=TemplateParser(canonical_assets);parser.feed(html);parser.close()
    if parser.stack:raise ValueError('Unbalanced HTML')
    return {'html':html,'assets':canonical_assets,'validated_html':''.join(parser.output)}


def render_uploaded_template(html,assets,slots):
    # Revalidate source and assets at consumption; DB content never becomes executable code.
    safe=validate_template(html,assets)['validated_html']
    def value(match):
        field=match[1].strip();item=slots.get(field,'')
        if field=='lineItems' and isinstance(item,list):
            return '<table><tbody>'+''.join('<tr><td>'+escape(str(row.get('description','')))+ '</td><td>'+escape(str(row.get('quantity','')))+ '</td><td>'+escape(str(row.get('unitPrice','')))+ '</td></tr>' for row in item)+'</tbody></table>'
        return escape(str(item)) if isinstance(item,(str,int,float)) else ''
    return re.sub(r'{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}',value,safe)
