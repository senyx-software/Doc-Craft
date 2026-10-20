import json
from PIL import Image
import pytest
from app.services.editable_templates import layout_from_pdf_words,bind_elements,editable_definition,render_editable_html
from app.services.document_contract import calculate_document_data


def word(text,x,y,w=60):return (x,y,x+w,y+11,text,0,0,0)


def pdf_definition():
    words=[word('Invoice',30,30),word('Invoice',30,80,35),word('number',70,80,40),word('PRIVATE-123',120,80),
        word('Bill',240,130,18),word('to',262,130,10),word('Private',240,150),word('Customer',305,150),
        word('Description',30,340),word('Qty',390,340,25),word('Unit',440,340,20),word('price',463,340,30),word('Amount',525,340,40),
        word('Original service',30,365,120),word('999.00',525,365),word('Subtotal',400,400),word('999.00',525,400)]
    elements,items,_=layout_from_pdf_words(Image.new('RGB',(595,842),'white'),words,0)
    return {'version':1,'pageWidth':595,'pageHeight':842,'pageCount':1,'elements':elements,'items':items}


def test_pdf_conversion_discards_original_transaction_values_and_keeps_editable_fields():
    definition=pdf_definition()
    serialized=json.dumps(definition)
    for private_value in ('PRIVATE-123','Private Customer','Original service','999.00'):
        assert private_value not in serialized
    assert definition['items']['y']>340
    assert {'invoiceNumber','clientName','subtotal'} <= {element.get('binding') for element in definition['elements']}
    empty=bind_elements(definition,{})
    assert all(element['text']=='' for element in empty if element.get('semanticField'))
    assert 'Description' in [element.get('text') for element in empty]
    assert all(element['type']!='image' for element in empty)


def test_canvas_fields_and_rows_refresh_from_saved_values_without_imported_defaults():
    definition=pdf_definition()
    data={'invoiceNumber':'NEW-42','clientName':'New client','currency':'USD','lineItems':[{'description':'New service','quantity':2,'unitPrice':25}]}
    elements=bind_elements(definition,data)
    assert next(element['text'] for element in elements if element.get('semanticField')=='invoiceNumber')=='NEW-42'
    assert next(element['text'] for element in elements if element['id']=='item_0_name')=='New service'
    assert next(element['text'] for element in elements if element['id']=='item_0_amount')=='$50.00'
    assert next(element['text'] for element in elements if element['id'].startswith('upl_field_subtotal'))=='$50.00'
    currency_only=bind_elements(definition,{'currency':'USD'})
    assert next(element['text'] for element in currency_only if element['id'].startswith('upl_field_subtotal'))==''


def test_html_uploads_have_an_editable_definition_and_escape_new_chat_values():
    definition=editable_definition({'html':'<h1>Invoice</h1><p>{{businessName}}</p><p>{{clientName}}</p><div>{{lineItems}}</div>','assets':{}},'invoice')
    assert {'businessName','clientName'} <= {element.get('binding') for element in definition['elements']}
    html=render_editable_html(definition,{'businessName':'<script>value</script>','clientName':'New client'})
    assert '&lt;script&gt;' in html and '<script>' not in html
    assert 'New client' in html and 'DC_businessName_ZZ' not in html
    with pytest.raises(ValueError):editable_definition({'html':'<script>bad()</script>','assets':{}},'invoice')


def test_partial_preview_calculations_use_the_same_discount_and_tax_rules():
    data=calculate_document_data({'currency':'USD','lineItems':[{'description':'Design','quantity':2,'unitPrice':50,'discountRate':10}],'discountRate':10,'taxRate':20})
    assert data['subtotal']==90 and data['discountAmount']==9 and data['taxAmount']==16.2 and data['totalDue']==97.2


def test_uploaded_server_previews_follow_selected_money_and_date_formats():
    definition=pdf_definition()
    prototype=next(element for element in definition['elements'] if element.get('binding')=='invoiceNumber')
    definition['elements'].append({**prototype,'id':'date','binding':'issueDate'})
    elements=bind_elements(definition,{'currency':'USD','locale':'de-DE','issueDate':'2026-10-20','dateFormat':'DD/MM/YYYY','lineItems':[{'description':'Service','quantity':1,'unitPrice':1234.5}]})
    assert next(element['text'] for element in elements if element['id']=='date')=='20/10/2026'
    assert next(element['text'] for element in elements if element['id']=='item_0_rate')=='$1.234,50'
