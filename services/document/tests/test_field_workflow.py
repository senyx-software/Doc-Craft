import json
import subprocess
from pathlib import Path
import pytest
from app.services.document_contract import validated_document
from app.services.sidecar import render_template_to_html
from app.routers import document

BASE={'businessName':'Nexora','clientName':'John Perera','invoiceNumber':'inv-001','issueDate':'2026-10-13','dueDate':'2026-11-13','currency':'LKR','lineItems':[{'description':'Website Development','quantity':1,'unitPrice':50000}]}
FULL={**BASE,'senderAddress':'10 Software Road, Colombo','clientAddress':'20 Client Road, Kandy','senderEmail':'hello@nexora.com','senderPhone':'+94771234567'}

def test_selected_template_requires_actual_contact_fields_but_minimal_allows_omission():
    assert validated_document('invoice',BASE,'invoice-minimal')['totalDue']==50000
    with pytest.raises(ValueError,match='senderAddress'): validated_document('invoice',BASE,'tmpl_invoice_odoo_community')
    assert validated_document('invoice',FULL,'tmpl_invoice_odoo_community')['businessName']=='Nexora'

def test_conditional_payment_and_tax_requirements():
    with pytest.raises(ValueError,match='accountDetails'):validated_document('invoice',{**BASE,'paymentMethod':'bank transfer'},'invoice-minimal')
    with pytest.raises(ValueError,match='taxRate'):validated_document('invoice',{**BASE,'taxStatus':'taxable'},'invoice-minimal')
    with pytest.raises(ValueError,match='Conflicting tax'):validated_document('invoice',{**BASE,'taxStatus':'exempt','taxRate':10},'invoice-minimal')

@pytest.mark.parametrize('currency,price,discount,tax',[('LKR',2.675,10,7.5),('JPY',1500.5,10,8),('USD',0.105,0,0)])
def test_decimal_and_currency_results_match_javascript(currency,price,discount,tax):
    raw={**BASE,'currency':currency,'lineItems':[{'description':'Design','quantity':3,'unitPrice':price}],'discountRate':discount,'taxRate':tax}
    result=validated_document('invoice',raw,'invoice-minimal')
    script="import {documentData} from './shared/document-contract.mjs';let input='';for await (const chunk of process.stdin) input+=chunk;console.log(JSON.stringify(documentData(JSON.parse(input))));"
    root=Path(__file__).resolve().parents[3]
    js=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps(raw).encode(),cwd=root))
    for key in ['subtotal','discountAmount','taxableAmount','taxAmount','totalDue']:assert result[key]==js[key]

def test_odoo_layout_uses_verified_parties_dates_currency_and_bank_data_only():
    raw={**FULL,'accountDetails':'SENYX Bank\nAccount 001-ABC','notesAndTerms':'Net 30','dateFormat':'DD/MM/YYYY','locale':'en-US','discountRate':10,'taxRate':5}
    html=render_template_to_html('invoice','tmpl_invoice_odoo_community',validated_document('invoice',raw,'tmpl_invoice_odoo_community'))
    assert 'brand-name' in html and 'account-data-banner' in html
    assert 'Nexora' in html and 'John Perera' in html
    assert '10 Software Road, Colombo' in html and '20 Client Road, Kandy' in html
    assert '13/10/2026' in html and 'Rs. 47,250.00' in html
    assert 'SENYX Bank' in html and 'Account 001-ABC' in html
    assert all(value not in html for value in ['JOHN SNOW','PENTOS','ADSA-2343','234W2Q3R','your.mail@gmail.com','Castle Black','1140,00 USD','$50'])

def test_empty_preview_has_no_sample_recipient_items_bank_or_contacts():
    html=render_template_to_html('invoice','tmpl_invoice_odoo_community',{})
    assert all(value not in html for value in ['JOHN SNOW','Castle Black','Dragon defence','PENTOS','ADSA-2343','Mockup','7896 Clouds','your.mail@gmail.com','1140,00 USD'])

@pytest.mark.asyncio
async def test_final_generation_requires_persisted_approval(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import Mock
    class Client:
        def __init__(self,*a,**kw):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*a):pass
        async def get(self,*a,**kw):return SimpleNamespace(status_code=200,json=lambda:{'state':{'userId':'u','documentType':'invoice','readyToGenerate':True,'canGenerate':False,'finalization':{'status':'unconfirmed'},'slots':FULL,'templateId':'tmpl_invoice_odoo_community'}})
    monkeypatch.setattr(document.httpx,'AsyncClient',Client)
    db=Mock()
    with pytest.raises(document.HTTPException) as error:await document.generate_document({'documentType':'invoice','sessionId':'s','confirmed':True},db=db,x_user_id='u',authorization='Bearer synthetic')
    assert error.value.status_code==422
    db.add.assert_not_called()
    db.commit.assert_not_called()

def test_chat_updates_preserve_parties_notes_banking_numbers_in_actual_pdf_template():
    raw={**FULL,'senderPhone':'0382298760','clientPhone':'0741234567','senderAddress':'SENYX Software, No. 40/20, Sagabo Mawatha, Diggala, Keselwatta, Panadura','clientAddress':'No. 2, Mattakkuliya, Colombo','notesAndTerms':'Valid for 30 days.','accountData':'BOC, Panadura, Account: 007903232'}
    verified=validated_document('invoice',raw,'tmpl_invoice_odoo_community')
    assert verified['senderPhone']=='0382298760' and verified['clientPhone']=='0741234567'
    assert verified['accountDetails']=='BOC, Panadura, Account: 007903232'
    html=render_template_to_html('invoice','tmpl_invoice_odoo_community',verified)
    recipient=html[html.index('<div class="recipient-box">'):html.index('<div class="sender-box">')]
    assert 'John Perera' in recipient and 'No. 2, Mattakkuliya, Colombo' in recipient
    assert '0382298760' in html and '0741234567' in html
    assert '007903232' in html and 'Valid for 30 days.' in html
    assert 'SENYX Software' in html and '50,000.00' in html

@pytest.mark.parametrize('currency,rate,fixed,item_discount', [('LKR',0,10000,0),('USD',10,None,12.5),('JPY',5,None,10),('USD',0,0.03,10)])
def test_shared_financial_program_parity_for_fixed_and_item_discounts(currency,rate,fixed,item_discount):
    raw={**BASE,'currency':currency,'lineItems':[{'description':'API Service','quantity':3,'unitPrice':50000 if currency=='LKR' else 2.675,'discountRate':item_discount}],'discountRate':rate,'taxRate':7.5}
    if fixed is not None:
        raw.pop('discountRate');raw['discountFixedAmount']=fixed
    js=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import{documentData}from'./shared/document-contract.mjs';console.log(JSON.stringify(documentData(JSON.parse(process.argv[1]))));",json.dumps(raw)],cwd=Path(__file__).resolve().parents[3],text=True))
    result=validated_document('invoice',raw)
    for key in ['subtotal','discountAmount','taxableAmount','taxAmount','totalDue']:assert result[key]==js[key]
    assert result['lineItems']==js['lineItems']

def test_fixed_discount_and_invalid_note_dates_are_rejected_before_export():
    with pytest.raises(ValueError,match='discount exceeds'):validated_document('invoice',{**BASE,'discountFixedAmount':200000})
    with pytest.raises(ValueError,match='Conflicting discount'):validated_document('invoice',{**BASE,'discountFixedAmount':1000,'discountRate':10})
    with pytest.raises(ValueError,match='Invalid document field'):validated_document('invoice',{**BASE,'notesAndTerms':'Last valid date: 2026-02-30.'})

def test_odoo_fixed_discount_payment_terms_and_item_discount_rendering():
    raw={**FULL,'paymentTerms':'Payment due within 14 days.','notesAndTerms':'Last valid date: 2026-12-12.','discountFixedAmount':1000,'lineItems':[{'description':'API Service','quantity':2,'unitPrice':10000,'discountRate':10}]}
    values=validated_document('invoice',raw,'tmpl_invoice_odoo_community')
    html=render_template_to_html('invoice','tmpl_invoice_odoo_community',values)
    assert 'Discount (fixed)' in html and 'Payment due within 14 days' in html and 'Last valid date' in html
    assert '10% discount' in html and '17,000.00' in html and 'undefined' not in html
