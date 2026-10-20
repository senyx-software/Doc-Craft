"""Validate generation against the same JSON field contract as chat/frontend."""
import json
import math
import re
from datetime import date
from decimal import Decimal, ROUND_HALF_UP, localcontext
from pathlib import Path
CONTRACT = json.loads((Path(__file__).resolve().parents[4] / "shared" / "document-contract.json").read_text())
TEMPLATES = json.loads((Path(__file__).resolve().parents[4] / 'shared' / 'template-schemas.json').read_text())['templates']
ALIASES = {re.sub(r"[^a-z0-9]", "", alias.lower()): key for key, field in CONTRACT["fields"].items() for alias in [key, *field["aliases"]]}
CURRENCIES = CONTRACT['formatting']['currencyAliases']

def valid_field(key, value):
    field = CONTRACT["fields"].get(key)
    if not field or value is None:
        return False
    kind = field["type"]
    if kind == "items":
        return isinstance(value, list) and 0 < len(value) <= 100 and all(isinstance(item, dict) and isinstance(item.get("description"), str) and item["description"].strip() and isinstance(item.get("quantity"), (int, float)) and not isinstance(item["quantity"], bool) and math.isfinite(item["quantity"]) and 0 < item["quantity"] <= field["itemLimits"]["maxQuantity"] and isinstance(item.get("unitPrice"), (int, float)) and not isinstance(item["unitPrice"], bool) and math.isfinite(item["unitPrice"]) and 0 <= item["unitPrice"] <= field["itemLimits"]["maxUnitPrice"] and item["quantity"] * item["unitPrice"] <= field["itemLimits"]["maxSubtotal"] and ("discountRate" not in item or isinstance(item["discountRate"], (int, float)) and not isinstance(item["discountRate"], bool) and math.isfinite(item["discountRate"]) and 0 <= item["discountRate"] <= 100) for item in value) and sum(item["quantity"] * item["unitPrice"] for item in value) <= field["itemLimits"]["maxSubtotal"]
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and field["min"] <= value <= field["max"]
    if not isinstance(value, str) or not value.strip() or len(value) > 4000:
        return False
    if field.get('enum') and value not in field['enum']: return False
    if key in ['notesAndTerms','paymentTerms'] and re.search(r'\b(date|valid|valide|validity|due|until|expiry)\b', value, re.I) and any(not valid_field('issueDate', token) for token in re.findall(r'\b\d{4}-\d{2}-\d{2}\b', value)): return False
    if key == 'locale': return value in CONTRACT['formatting']['locales']
    if kind == "date":
        try: return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)) and date.fromisoformat(value).isoformat() == value
        except ValueError: return False
    if kind == "email":
        if not re.fullmatch(r'[^\s@<>()\[\]:;,"\\]+@[^\s@]+\.[^\s@]+', value) or len(value)>254:return False
        local,domain=value.split('@')
        return len(local)<=64 and not local.startswith('.') and not local.endswith('.') and '..' not in value and all(0<len(label)<=63 and label[0].isalnum() and label[-1].isalnum() and all(char.isalnum() or char=='-' for char in label) for label in domain.split('.'))
    if kind == "phone": return bool(re.fullmatch(r"\+?[\d ().-]{7,30}", value)) and 7 <= len(re.sub(r"\D", "", value)) <= 15
    if kind == "currency": return value in CONTRACT['formatting']['currencyDigits']
    if key in ["businessName", "clientName"]: return len(value) <= 160 and not re.search(r"[\n?]", value)
    return True

def template_schema(document_type, template_id=None, document_schema=None):
    spec = CONTRACT['documents'].get(document_type)
    if not spec: raise ValueError('Unsupported document type')
    template = TEMPLATES.get(template_id)
    if template and document_type not in template['documentTypes']: raise ValueError('Incompatible template')
    schema = template.get('schema', {}) if template else {}
    required = list(dict.fromkeys([*spec['required'], *schema.get('required', []), *((document_schema or {}).get('required_keys', []))]))
    return {**spec, 'required': required, 'conditional': [*spec.get('conditional', []), *schema.get('conditional', [])]}

def validated_document(document_type, raw, template_id=None, document_schema=None):
    spec = template_schema(document_type, template_id, document_schema)
    if not spec: raise ValueError("Unsupported document type")
    slots = {}
    for alias, value in raw.items():
        key = ALIASES.get(re.sub(r"[^a-z0-9]", "", alias.lower()))
        if not key: continue
        if isinstance(value, str): value = value.strip()
        if key == "currency": value = CURRENCIES.get(str(value).lower(), str(value).upper())
        if key in slots and slots[key] != value: raise ValueError("Conflicting field aliases")
        slots[key] = value
    required = list(spec["required"])
    for rule in spec.get("conditional", []):
        if str(slots.get(rule["whenField"], "")).lower() in rule["values"] and rule['field'] not in required: required.append(rule["field"])
    missing = [key for key in required if not valid_field(key, slots.get(key))]
    if missing: raise ValueError("Incomplete required fields: " + ", ".join(missing))
    if any(not valid_field(key, value) for key, value in slots.items()): raise ValueError("Invalid document field")
    if slots.get('dueDate') and slots['dueDate'] < slots['issueDate']: raise ValueError('Due date is before issue date')
    if slots.get('taxStatus') in ['exempt','not applicable'] and slots.get('taxRate', 0) > 0: raise ValueError('Conflicting tax applicability')
    return calculate_document_data(slots)


def calculate_document_data(raw):
    """Derive amounts from validated fields for complete documents and partial previews."""
    slots=dict(raw)
    if valid_field("lineItems", slots.get("lineItems")):
        digits = CONTRACT['formatting']['currencyDigits'].get(slots.get('currency'), 2)
        unit = 10 ** digits
        def money(first, second=1, divisor=1):
            with localcontext() as context:
                context.prec = 50
                return float((Decimal(str(first)) * Decimal(str(second)) / Decimal(str(divisor))).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP))
        def evaluate(expression, values):
            if isinstance(expression, (int, float)): return expression
            if 'ref' in expression:
                value = values.get(expression['ref'], expression.get('fallback'))
                return expression.get('fallback') if expression.get('validated') and not valid_field(expression['ref'], value) else value
            args = expression.get('args', [])
            operation = expression['op']
            if operation == 'coalesce':
                value = evaluate(args[0], values)
                return evaluate(args[1], values) if value is None else value
            if operation == 'sumItems': return sum(round(item[expression['field']] * unit) for item in slots['lineItems']) / unit
            operands = [evaluate(arg, values) for arg in args]
            if operation == 'multiply': return money(operands[0], operands[1])
            if operation == 'percent': return money(operands[0], operands[1], 100)
            if operation == 'validFixed': return money(operands[0]) if valid_field('discountFixedAmount', operands[0]) and operands[0] <= operands[1] else 0 if valid_field('discountFixedAmount', operands[0]) else None
            if operation == 'subtract': return (round(operands[0] * unit) - round(operands[1] * unit)) / unit
            if operation == 'add': return (round(operands[0] * unit) + round(operands[1] * unit)) / unit
            raise ValueError('Unsupported financial expression')
        def calculate(values, definitions):
            for key, expression in definitions.items(): values[key] = evaluate(expression, values)
            return values
        slots['lineItems'] = [calculate(dict(item), CONTRACT['financial']['lineItemCalculations']) for item in slots['lineItems']]
        calculate(slots, CONTRACT['financial']['documentCalculations'])
        if slots.get('discountFixedAmount', 0) > slots['subtotal']: raise ValueError('Fixed discount exceeds subtotal')
        if slots.get('discountFixedAmount', 0) > 0 and slots.get('discountRate', 0) > 0: raise ValueError('Conflicting discount modes')
        for item in slots['lineItems']:
            if 'discountRate' not in item:
                item.pop('grossTotal', None)
                item.pop('discountAmount', None)
    slots["currencySymbol"] = CONTRACT['formatting']['currencySymbols'].get(slots.get("currency"), (slots.get("currency") + " ") if slots.get("currency") else "")
    return slots
