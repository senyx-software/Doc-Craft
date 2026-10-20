import base64
import json
from io import BytesIO

import fitz
from fastapi import FastAPI
from fastapi.testclient import TestClient
import httpx
from PIL import Image
import pytest

from app.routers import document
from app.services.pdf_template import import_pdf_template, MAX_PDF_BYTES
from shared.safe_template import render_uploaded_template


def pdf_bytes(pages=1, password=None):
    with fitz.open() as pdf:
        for index in range(pages):
            page = pdf.new_page(width=595 if index % 2 == 0 else 842, height=842 if index % 2 == 0 else 595)
            page.insert_text((50, 60), f'Company template page {index + 1}')
        options = {'encryption': fitz.PDF_ENCRYPT_AES_256, 'owner_pw': password, 'user_pw': password} if password else {}
        return pdf.tobytes(**options)


def encoded_pdf(**kwargs):
    return base64.b64encode(pdf_bytes(**kwargs)).decode()


def test_pdf_pages_become_bounded_safe_raster_assets_with_page_breaks():
    source = import_pdf_template(encoded_pdf(pages=6))
    assert len(source['assets']) == 6
    assert len(json.dumps(source).encode()) < 950000
    for data in source['assets'].values():
        assert len(data) <= 150000
        with Image.open(BytesIO(base64.b64decode(data.split(',')[1]))) as image:
            assert image.width * image.height <= 1048576
    html = render_uploaded_template(**source, slots={})
    assert html.count('<img ') == 6
    assert html.count('page-break-before:always') == 5
    assert 'data:image/png;base64,' in html
    assert 'asset:' not in html


def test_image_heavy_pdf_is_resized_to_fit_existing_review_asset_limits():
    image = Image.effect_noise((800, 800), 100).convert('RGB')
    raster = BytesIO()
    image.save(raster, format='PNG')
    with fitz.open() as pdf:
        page = pdf.new_page(width=800, height=800)
        page.insert_image(page.rect, stream=raster.getvalue())
        source = import_pdf_template(base64.b64encode(pdf.tobytes()).decode())
    data = source['assets']['pdf_page_1']
    assert len(data) <= 150000
    with Image.open(BytesIO(base64.b64decode(data.split(',')[1]))) as imported:
        assert imported.width < 800
        assert imported.width == imported.height
    assert '<img ' in render_uploaded_template(**source, slots={})


@pytest.mark.parametrize('encoded, message', [
    ('not base64!', 'not valid base64'),
    (base64.b64encode(b'<script>bad()</script>').decode(), 'valid PDF'),
    (base64.b64encode(b'%PDF-broken').decode(), 'could not be read'),
    ('A' * (4 * ((MAX_PDF_BYTES + 2) // 3) + 1), '5 MB'),
])
def test_invalid_pdf_is_rejected_with_actionable_error(encoded, message):
    with pytest.raises(ValueError, match=message):
        import_pdf_template(encoded)


def test_encrypted_and_excessive_page_uploads_are_rejected():
    with pytest.raises(ValueError, match='password'):
        import_pdf_template(encoded_pdf(password='secret'))
    with pytest.raises(ValueError, match='1–6 pages'):
        import_pdf_template(encoded_pdf(pages=7))


def test_pdf_upload_flattens_before_forwarding_with_server_owned_private_scope(monkeypatch):
    app = FastAPI()
    app.include_router(document.router, prefix='/v1/document')
    calls = []
    def save(*args, **kwargs):
        calls.append(kwargs['json'])
        return httpx.Response(201, json={'id': 'upl_test_v1'}, request=httpx.Request('POST', 'http://admin-api/upload'))
    monkeypatch.setattr(document, 'service_request', save)
    client = TestClient(app)
    payload = {'name': 'Company PDF', 'document_type': 'invoice', 'pdf_base64': encoded_pdf()}
    result = client.post('/v1/document/templates/uploads', headers={'x-user-id': 'owner'}, json=payload)
    assert result.status_code == 201, result.text
    assert calls[0]['owner_id'] == 'owner'
    assert calls[0]['visibility'] == 'private'
    assert calls[0]['premium'] is False
    assert 'pdf_base64' not in calls[0]
    assert calls[0]['assets']
    for overrides in ({'visibility': 'public'}, {'owner_id': 'someone-else'}, {'premium': True}, {'html': '<p>Mixed</p>'}, {'pdf_base64': 'invalid!'}):
        rejected = client.post('/v1/document/templates/uploads', headers={'x-user-id': 'owner'}, json={**payload, **overrides})
        assert rejected.status_code == 422
    assert len(calls) == 1


@pytest.mark.parametrize('body,expected', [
    ({'detail':'Template rejected: Unsafe CSS'}, 'Template rejected: Unsafe CSS'),
    ({'message':'Invalid request payload or query parameters','details':{'validation_errors':[{'loc':['body','document_type'],'msg':'Field required'}]}}, [{'loc':['body','document_type'],'msg':'Field required'}]),
])
def test_admin_validation_details_reach_upload_client(monkeypatch, body, expected):
    monkeypatch.setattr(document, 'service_request', lambda *args, **kwargs: httpx.Response(422, json=body))
    app = FastAPI()
    app.include_router(document.router)
    result = TestClient(app).post('/templates/uploads', headers={'x-user-id': 'owner'}, json={'html': '<p style="position:fixed">Test</p>'})
    assert result.status_code == 422
    assert result.json()['detail'] == expected
