"""Install the pinned English OCR data used by editable PDF templates locally."""
import hashlib
from pathlib import Path
from urllib.request import urlopen

TARGET=Path(__file__).resolve().parents[1]/'.local/tessdata/eng.traineddata'
SHA256='7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2'
URL='https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/eng.traineddata'

if __name__=='__main__':
    data=TARGET.read_bytes() if TARGET.exists() else urlopen(URL,timeout=30).read()
    if hashlib.sha256(data).hexdigest()!=SHA256:raise RuntimeError('OCR language data integrity check failed')
    TARGET.parent.mkdir(parents=True,exist_ok=True)
    TARGET.write_bytes(data)
    print('Template OCR language data installed.')
