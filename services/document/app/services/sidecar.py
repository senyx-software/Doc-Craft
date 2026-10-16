from shared.service_auth import async_service_client
import os
import httpx
from jinja2 import Environment, FileSystemLoader, select_autoescape, Undefined
from dotenv import load_dotenv

# Load service-specific environment file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "document.env"))

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")

# Configure Jinja2 environment
jinja_env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(['html', 'xml'])
)

SIDECAR_URL = os.getenv("SIDECAR_URL", "http://localhost:3023/generate")

def format_money(value, currency='USD', locale='en-US'):
    from app.services.document_contract import CONTRACT
    if value is None or isinstance(value,Undefined): return ''
    digits=CONTRACT['formatting']['currencyDigits'].get(currency, 2)
    from decimal import Decimal, ROUND_HALF_UP
    try: formatted=f'{Decimal(str(value)).quantize(Decimal(1).scaleb(-digits),rounding=ROUND_HALF_UP):,.{digits}f}'
    except (TypeError,ValueError): return ''
    if locale=='de-DE': formatted=formatted.replace(',', '_').replace('.', ',').replace('_', '.')
    if locale=='fr-FR': formatted=formatted.replace(',', '\u202f').replace('.', ',')
    return formatted

jinja_env.filters['money']=format_money


def render_template_to_html(document_type: str, template_id: str, slots: dict, user_id=None) -> str:
    if template_id.startswith('upl_'):
        if not user_id:raise ValueError('Verified owner required')
        from app.services.uploaded_templates import fetch_uploaded
        from shared.safe_template import render_uploaded_template
        from shared.entitlements import get_entitlements,require_entitlement
        item=fetch_uploaded(user_id,template_id)
        if item['type']!=document_type:raise ValueError('Incompatible uploaded template')
        policy=get_entitlements(user_id)
        if item['premium']:require_entitlement(policy,'premium_templates')
        if item['source']['assets']:require_entitlement(policy,'custom_branding')
        return render_uploaded_template(item['source']['html'],item['source']['assets'],slots)
    """
    Renders Jinja2 HTML template with slots data.
    """
    # Fallback default template name
    if not template_id:
        template_id = "classic"

    from app.routers.document import TEMPLATE_DEFS
    if template_id in TEMPLATE_DEFS:
        variant = TEMPLATE_DEFS[template_id].get("variant", template_id)
    elif "-" in template_id:
        parts = template_id.split("-", 1)
        variant = parts[1] if parts[0] == document_type else template_id
    elif template_id.startswith("tmpl_"):
        variant = template_id.replace(f"tmpl_{document_type}_", "").replace("_", "-")
    else:
        variant = template_id

    # Frontend-only Figma template IDs are rendered with the supported server classic variant.
    # Browser canvas export retains the selected layout; queued server PDFs use this explicit mapping.
    if template_id.startswith("tmpl_") and template_id not in TEMPLATE_DEFS:
        variant = "classic"
    from app.services.document_contract import ALIASES, valid_field
    accepted={key:value for key,value in slots.items() if key in ['subtotal','taxAmount','totalDue','discountAmount','taxableAmount','currencySymbol'] or key in ALIASES.values() and valid_field(key,value)}
    slots=accepted
    for key in ['issueDate','dueDate']:
        if slots.get(key) and slots.get('dateFormat') in ['DD/MM/YYYY','MM/DD/YYYY']:
            year,month,day=slots[key].split('-');slots[key]=f'{day}/{month}/{year}' if slots['dateFormat']=='DD/MM/YYYY' else f'{month}/{day}/{year}'
    if slots.get('paymentTerms'): slots['notesAndTerms']='\n'.join(filter(None,[slots.get('notesAndTerms',''),'Payment terms: '+slots['paymentTerms']]))
    if slots.get('lineItems'): slots['lineItems']=[{**item,'description':item['description']+(f" ({item['discountRate']}% discount)" if item.get('discountRate',0)>0 else '')} for item in slots['lineItems']]
    document_type = "purchaseOrder" if document_type == "purchase_order" else document_type
    slots = {**slots, "senderName": slots.get("businessName", ""),
             "amountPaid": slots.get("totalDue"),
             "proposalTitle": slots.get("subject", ""),
             "executiveSummary": slots.get("businessServices", slots.get("subject", "")),
             "scopeOfWork": "\n".join(item["description"] for item in slots.get("lineItems", [])),
             "paymentTerms": slots.get("paymentTerms", ""),
             "shippingInstructions": slots.get("notesAndTerms", ""),
             "totalAmount": slots.get("totalDue"), "notes": slots.get("notesAndTerms", ""),
             "paymentInstructions": slots.get("accountDetails", ""),
             "quoteNumber": slots.get("invoiceNumber", ""), "receiptNumber": slots.get("invoiceNumber", ""),
             "poNumber": slots.get("invoiceNumber", ""), "validUntil": slots.get("dueDate", ""),
             "deliveryDate": slots.get("dueDate", ""), "paymentDate": slots.get("issueDate", ""),
             "clientVat":slots.get('clientTaxId',''),"taxId":slots.get('senderTaxId',''),"senderVat":slots.get('senderTaxId','')}

    # Template path relative to templates directory
    template_path = f"{document_type}/{variant}.html"

    try:
        template = jinja_env.get_template(template_path)
        return template.render(**slots)
    except Exception as e:
        raise Exception(f"Failed to render Jinja2 template {template_path}: {e}")


async def generate_pdf_via_sidecar(html_string: str, assets=None) -> bytes:
    """
    POSTs the rendered HTML to the Puppeteer sidecar and returns PDF binary data.
    """
    async with async_service_client("pdf", timeout=30.0) as client:
        try:
            response = await client.post(SIDECAR_URL, json={"htmlString": html_string, **({'assets':assets} if assets else {})})
            if response.status_code != 200:
                raise Exception(f"Sidecar returned status {response.status_code}: {response.text}")
            return response.content
        except Exception as e:
            raise Exception(f"Failed to connect to Puppeteer sidecar at {SIDECAR_URL}: {e}")
