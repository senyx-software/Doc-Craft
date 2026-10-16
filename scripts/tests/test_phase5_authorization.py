"""Owner denial takes precedence over the stale initial live-test flag."""
import importlib.util
from pathlib import Path
def test_disabled_paid_calls_do_not_read_credentials_or_start_a_process(monkeypatch):
    root=Path(__file__).resolve().parents[2]
    spec=importlib.util.spec_from_file_location('phase5_stack_probes',root/'scripts/phase5_stack_probes.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    monkeypatch.setenv('PHASE5_APPROVED_GROQ','8_REQUESTS_USD_0.10')
    monkeypatch.setattr(module,'dotenv_values',lambda *a,**k:(_ for _ in ()).throw(AssertionError('Credential read after owner denial')))
    monkeypatch.setattr(module.subprocess,'run',lambda *a,**k:(_ for _ in ()).throw(AssertionError('Process started after owner denial')))
    context={'checks':[]}
    module.run_live(context)
    assert context['checks'][0]['status']=='BLOCKED'
