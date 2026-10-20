import fitz  # PyMuPDF
import math
from app.services.pdf_runtime import run_pdf_task

def apply_watermark_to_pdf(pdf_bytes: bytes) -> bytes:
    return run_pdf_task(_apply_watermark_to_pdf,pdf_bytes)

def _apply_watermark_to_pdf(pdf_bytes: bytes) -> bytes:
    """
    Applies a diagonal semi-transparent "DocCraft" watermark to each page of the PDF.
    """
    try:
        # Open PDF from bytes
        doc = fitz.open("pdf", pdf_bytes)
        
        for page in doc:
            rect = page.rect
            center = fitz.Point(rect.width / 2, rect.height / 2)
            
            # Calculate diagonal angle from bottom-left to top-right (y-axis goes down)
            angle = -math.degrees(math.atan2(rect.height, rect.width))
            
            text = "DocCraft"
            fontsize = 65
            
            # Position the text start point such that the text is visually centered on the page
            # Rough approximation of text length: character count * average character width
            text_len = len(text) * fontsize * 0.48
            start_point = fitz.Point(center.x - text_len / 2, center.y + fontsize / 3)
            
            page.insert_text(
                start_point,
                text,
                fontsize=fontsize,
                fontname="helv",
                color=(0.8, 0.8, 0.8),  # Light gray
                fill_opacity=0.15,      # Semi-transparent
                morph=(center, fitz.Matrix(angle))
            )
            
        # Return modified PDF bytes
        watermarked_pdf = doc.write()
        doc.close()
        return watermarked_pdf
    except Exception as e:
        print(f"[watermark] Error applying watermark: {e}")
        # Return original if watermarking fails so the user still gets their file
        return pdf_bytes
