"""Flatten PDF uploads into the existing reviewed, data-only template format."""
import base64
import binascii
from io import BytesIO
import math

import fitz
from PIL import Image

from shared.safe_template import validate_template
from app.services.pdf_runtime import run_pdf_task

MAX_PDF_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 6


def import_pdf_template(encoded):
    return run_pdf_task(_import_pdf_template,encoded)


def _import_pdf_template(encoded):
    if not isinstance(encoded, str) or len(encoded) > 4 * math.ceil(MAX_PDF_BYTES / 3):
        raise ValueError('Choose a PDF no larger than 5 MB.')
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError('The PDF upload is not valid base64.') from error
    if len(raw) > MAX_PDF_BYTES:
        raise ValueError('Choose a PDF no larger than 5 MB.')
    if not raw.startswith(b'%PDF-'):
        raise ValueError('Choose a valid PDF file.')

    assets, pages = {}, []
    try:
        with fitz.open(stream=raw, filetype='pdf') as document:
            if document.needs_pass:
                raise ValueError('Remove the PDF password before uploading.')
            if not 1 <= document.page_count <= MAX_PDF_PAGES:
                raise ValueError('Choose a PDF with 1–6 pages.')
            for index, page in enumerate(document):
                width, height = page.rect.width, page.rect.height
                if not all(math.isfinite(n) and n > 0 for n in (width, height)):
                    raise ValueError('The PDF contains an invalid page size.')
                scale = min(1024 / max(width, height), math.sqrt(1000000 / (width * height)))
                pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False)
                image = Image.frombytes('RGB', (pixmap.width, pixmap.height), pixmap.samples).convert('RGBA')
                # Bound the canonical PNG, including after the shared validator re-encodes it.
                # Six assets plus HTML remain below the admin API's 1 MB body limit.
                while True:
                    output = BytesIO()
                    image.save(output, format='PNG')
                    asset = 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode('ascii')
                    if len(asset) <= 150000:
                        break
                    image = image.resize((max(1, int(image.width * .8)), max(1, int(image.height * .8))), Image.Resampling.LANCZOS)
                name = f'pdf_page_{index + 1}'
                assets[name] = asset
                page_break = 'page-break-before:always;' if index else ''
                pages.append(f'<div style="{page_break}page-break-inside:avoid"><img src="asset:{name}" alt="PDF page {index + 1}" style="display:block;width:100%"></div>')
    except ValueError:
        raise
    except Exception as error:
        raise ValueError('The PDF could not be read. Export a new PDF and try again.') from error

    source = validate_template('<html><body style="margin:0">' + ''.join(pages) + '</body></html>', assets)
    return {'html': source['html'], 'assets': source['assets']}
