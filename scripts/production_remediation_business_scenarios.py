"""Supplemental real inference cases for explicit business details; baseline112 unchanged."""
import importlib.util
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('real_cases',ROOT/'scripts/hybrid_live_scenarios.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.OUT=ROOT/'docs/production-remediation/evidence/ai/business-supplement'
module.OUT.mkdir(parents=True,exist_ok=True)
(module.OUT/'tool-schemas.json').write_bytes((ROOT/'docs/production-remediation/evidence/ai/current-tool-schemas.json').read_bytes())
cases=[]
def case(text,expected):
    cases.append({'id':'business-'+str(len(cases)+1).zfill(2),'category':'business_details','message':text,'expected':{'slots':expected},'slots':module.BASE.copy(),'editor':module.EDITOR.copy(),'history':[]})
case('Our address is 14 Market Road, Colombo. The customer address is 25 Lake Street, Kandy.',{'senderAddress':'14 Market Road, Colombo','clientAddress':'25 Lake Street, Kandy'})
case('Set business email to billing@nexora.example and customer email to alex@customer.example.',{'senderEmail':'billing@nexora.example','clientEmail':'alex@customer.example'})
case('Use issue date 2026-11-10 and due date 2026-11-17.',{'issueDate':'2026-11-10','dueDate':'2026-11-17'})
case('Change the legal business name to Nexora iT (Pvt) Ltd. Preserve that capitalization.',{'businessName':'Nexora iT (Pvt) Ltd'})
case('Customer legal name is McDonald de Silva. Keep the spelling and capitalization exactly.',{'clientName':'McDonald de Silva'})
case('Set the notes to Please deliver within seven days.',{'notesAndTerms':'Please deliver within seven days.'})
case('Set payment terms to 50% deposit and 50% on delivery.',{'paymentTerms':'50% deposit and 50% on delivery.'})
case('Use currency LKR, tax 10%, and a discount of 5%.',{'currency':'LKR','taxRate':10,'discountRate':5})
module.scenarios=lambda:cases
sys.argv=[sys.argv[0],'--model','qwen3:1.7b-q4_K_M','--limit',str(len(cases)),'--label','business-1.7b','--context','8192']
module.main()
