const fields = { header_name: 'businessName', header_org: 'businessName', sender_name: 'businessName', prep_by_val: 'businessName', client_name: 'clientName', sender_email: 'senderEmail', sender_address: 'senderAddress', sender_phone: 'senderPhone', client_email: 'clientEmail', client_address: 'clientAddress', client_phone: 'clientPhone', meta_number_value: 'invoiceNumber', meta_invoice_value: 'invoiceNumber', meta_date_value: 'issueDate', meta_issue_value: 'issueDate', meta_duedate_value: 'dueDate', meta_due_value: 'dueDate', subject_value: 'subject', notes_value: 'notesAndTerms', notes_body: 'notesAndTerms', account_data_value: 'accountDetails' };
export function canvasField(id) { return fields[id]; }
export function semanticCanvasPatch(id, text, slots) {
    const field = canvasField(id);
    if (field)
        return { [field]: text };
    const match = id.match(/^item_(\d+)_(name|qty|rate)$/);
    if (!match || !Array.isArray(slots.lineItems) || !slots.lineItems[Number(match[1])])
        return null;
    const items = slots.lineItems.map(item => ({ ...item })), item = items[Number(match[1])];
    if (match[2] === 'name')
        item.description = text;
    else {
        const match = String(text).trim().match(/^(?:[A-Za-z]{3}\s+|Rs\.?\s*|[$€£₹]\s*)?(-?\d[\d,]*(?:\.\d+)?)$/);
        const number = match ? Number(match[1].replace(/,/g, '')) : NaN;
        if (!Number.isFinite(number) || !String(text).trim())
            throw new Error('Invalid numeric item value');
        item[match[2] === 'qty' ? 'quantity' : 'unitPrice'] = number;
    }
    return { lineItems: items };
}
