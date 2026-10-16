import { describe, expect, it, vi } from 'vitest';
import { preparePdfDownload } from '../pdfDownload';
import { snapshot } from '../../../../shared/conversation-state.mjs';
import type { ConversationSnapshot } from '../../types';

const slots = { businessName:'Nexora', clientName:'Yohan', senderAddress:'10 Sender Road', senderEmail:'hello@nexora.com', senderPhone:'0771234567', clientAddress:'20 Client Road', invoiceNumber:'INV-1', issueDate:'2026-10-14', dueDate:'2026-12-12', currency:'LKR', lineItems:[{description:'Website Development',quantity:2,unitPrice:100000}] };
function fixture(raw = slots): ConversationSnapshot {
  return snapshot({ id:'s', status:'ACTIVE', documentTypeId:'invoice', templateId:'tmpl_invoice_odoo_community', slots:raw }) as ConversationSnapshot;
}
function setup(state = fixture()) {
  const confirm = vi.fn(async (value:ConversationSnapshot) => ({...value,revision:value.revision+1,finalization:{...value.finalization!,status:'confirmed'}}));
  return {sessionId:'s',fingerprint:state.finalization!.fingerprint,isCurrent:()=>true,read:vi.fn(async()=>state),confirm,reconcile:vi.fn()};
}
describe('direct PDF approval without a conversational provider', () => {
  it('validates and confirms the committed revision directly on Download', async()=>{
    const options=setup(), result=await preparePdfDownload(options);
    expect(options.read).toHaveBeenCalledOnce();expect(options.confirm).toHaveBeenCalledWith(expect.objectContaining({sessionId:'s',slots:expect.objectContaining({businessName:'Nexora'})}));
    expect(result.finalization?.status).toBe('confirmed');expect(options.reconcile).toHaveBeenLastCalledWith(result);
  });
  it('a provider failure does not block downloading valid saved details, or consume its pending retry', async()=>{
    const state=fixture({...slots,_chat:{latestTurnId:'turn',turns:{turn:{status:'failure',retryable:true,message:'Please suggest wording'}}}} as typeof slots);
    expect(state.readyToGenerate).toBe(false);expect(state.dataValid).toBe(true);
    const options=setup(state);const result=await preparePdfDownload(options);
    expect(result.pendingTurn?.id).toBe('turn');expect(options.confirm).toHaveBeenCalledOnce();
  });
  it('already confirmed documents do not need another confirmation write', async()=>{
    const state=fixture();state.finalization!.status='confirmed';const options=setup(state);
    expect(await preparePdfDownload(options)).toBe(state);expect(options.confirm).not.toHaveBeenCalled();
  });
  it('required missing fields block confirmation and export', async()=>{
    const options=setup(fixture({...slots,clientName:''}));
    await expect(preparePdfDownload(options)).rejects.toThrow('Complete or clarify');expect(options.confirm).not.toHaveBeenCalled();
  });
  it('pending edits require clarification instead of being silently discarded', async()=>{
    const state=fixture();state.pendingIntent={kind:'operation',field:'lineItems'};const options=setup(state);
    await expect(preparePdfDownload(options)).rejects.toThrow('Complete or clarify');expect(options.confirm).not.toHaveBeenCalled();
  });
  it('a remotely changed document is reconciled but requires a fresh Download click', async()=>{
    const options=setup(fixture({...slots,clientName:'Changed client'}));options.fingerprint=fixture().finalization!.fingerprint;
    await expect(preparePdfDownload(options)).rejects.toThrow('preview has been updated');expect(options.confirm).not.toHaveBeenCalled();expect(options.reconcile).toHaveBeenCalledOnce();
  });
  it('a session switch cannot approve or export the previous session', async()=>{
    const options=setup();options.isCurrent=()=>false;
    await expect(preparePdfDownload(options)).rejects.toThrow('document changed');expect(options.reconcile).not.toHaveBeenCalled();expect(options.confirm).not.toHaveBeenCalled();
  });
  it('read failures and persistence failures prevent export rather than claiming success', async()=>{
    const options=setup();options.read.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(preparePdfDownload(options)).rejects.toThrow('Storage unavailable');expect(options.confirm).not.toHaveBeenCalled();
    options.confirm.mockRejectedValueOnce(new Error('Confirmation write failed'));
    await expect(preparePdfDownload(options)).rejects.toThrow('Confirmation write failed');
  });
  it('a revision conflict cannot confirm a newer, unseen document', async()=>{
    const options=setup();options.confirm.mockResolvedValueOnce({...fixture(),revision:1,finalization:{status:'confirmed',fingerprint:'different'}});
    await expect(preparePdfDownload(options)).rejects.toThrow('could not be confirmed');expect(options.reconcile).toHaveBeenCalledOnce();
  });
});
