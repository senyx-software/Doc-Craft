"""Render every server template through the real local Puppeteer sidecar.

Run with an isolated DATABASE_URL and SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
empty; start the sidecar separately on 127.0.0.1:3029.
"""
import json
import os
from pathlib import Path
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading
import httpx
import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/document"))
from app.services.document_contract import validated_document
from app.services.sidecar import render_template_to_html

OUT = Path(os.environ.get("AUDIT_EVIDENCE_DIR", str(ROOT / "docs/system-audit/evidence")))
OUT.mkdir(parents=True, exist_ok=True)
BASE = {"businessName": "Nexora", "clientName": "Audit Customer", "invoiceNumber": "AUDIT-001", "issueDate": "2026-10-15", "dueDate": "2026-11-15", "currency": "USD", "lineItems": [{"description": "Design service", "quantity": 3, "unitPrice": 2.675}], "taxRate": 7.5, "subject": "Audit Project", "paymentMethod": "Cash"}
results = []
from shared.service_auth import service_client
with service_client('pdf',timeout=30) as client:
    for template in sorted((ROOT / "services/document/app/templates").glob("*/*.html")):
        kind, variant = template.parent.name, template.stem
        if kind == "purchaseOrder": kind = "purchase_order"
        data = validated_document(kind, BASE)
        html = render_template_to_html(kind, variant, data)
        response = client.post("http://127.0.0.1:3029/generate", json={"htmlString": html})
        response.raise_for_status()
        pdf = fitz.open(stream=response.content, filetype="pdf")
        text = " ".join(page.get_text() for page in pdf)
        expected = ["Nexora", "Audit Customer"]
        if kind != "proposal": expected.append("8.63")
        passed = response.content.startswith(b"%PDF") and all(value in text for value in expected)
        artifact = f"pdf-{kind}-{variant}.pdf"
        (OUT / artifact).write_bytes(response.content)
        results.append({"document_type": kind, "template": variant, "status": "PASS" if passed else "FAIL", "pages": len(pdf), "bytes": len(response.content), "expected_text": expected, "text_found": {value: value in text for value in expected}, "artifact": artifact, "method": "Actual template render + local HTTP sidecar + Chromium PDF + extracted text"})
        pdf.close()

    received = []
    class Trap(BaseHTTPRequestHandler):
        def do_GET(self):
            received.append(self.path)
            self.send_response(200); self.end_headers(); self.wfile.write(b"private")
        def log_message(self, *args): pass
    trap = HTTPServer(("127.0.0.1", 0), Trap)
    thread = threading.Thread(target=trap.serve_forever, daemon=True); thread.start()
    try:
        html = f'<html><body>Audit safe renderer<script>document.body.innerText="EXECUTED"</script><img src="http://127.0.0.1:{trap.server_port}/private"></body></html>'
        response = client.post("http://127.0.0.1:3029/generate", json={"htmlString": html})
        response.raise_for_status()
        pdf = fitz.open(stream=response.content, filetype="pdf")
        text = " ".join(page.get_text() for page in pdf)
        results.append({"scenario": "Renderer blocks active scripts and internal network fetches", "status": "PASS" if not received and "Audit safe renderer" in text and "EXECUTED" not in text else "FAIL", "trap_requests": len(received)})
        pdf.close()
    finally:
        trap.shutdown(); trap.server_close(); thread.join()
(OUT / "pdf-scenarios.json").write_text(json.dumps(results, indent=2))
print(json.dumps({"scenarios": len(results), "passed": sum(x["status"] == "PASS" for x in results), "failed": sum(x["status"] == "FAIL" for x in results)}))
if any(x["status"] != "PASS" for x in results): raise SystemExit(1)
