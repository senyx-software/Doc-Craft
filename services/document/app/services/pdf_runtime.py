"""Keep MuPDF/OCR work in one process, away from ASGI request threads."""
from concurrent.futures import ProcessPoolExecutor
from multiprocessing import get_context
from threading import Lock

_executor=None
_lock=Lock()


def run_pdf_task(function,*args):
    global _executor
    with _lock:
        if _executor is None:_executor=ProcessPoolExecutor(max_workers=1,mp_context=get_context('spawn'))
        executor=_executor
    return executor.submit(function,*args).result(timeout=90)


def shutdown_pdf_executor():
    global _executor
    with _lock:
        executor,_executor=_executor,None
    if executor:executor.shutdown(wait=False,cancel_futures=True)
