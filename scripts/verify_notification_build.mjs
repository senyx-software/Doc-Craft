/** Exercise the packaged HTML assets with real rendering, no provider calls. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import handlebars from 'handlebars';
const root=new URL('../services/notification/dist/templates/',import.meta.url);
const receipt=handlebars.compile(readFileSync(new URL('payment_receipt.hbs',root),'utf8'))({amountFormatted:'KWD 1.234',currency:'KWD',invoiceId:'fixture-1',transactionReference:'<untrusted>',gateway:'paddle'});
assert.match(receipt,/KWD 1\.234/);assert.match(receipt,/&lt;untrusted&gt;/);
for(const type of ['verify_email','password_reset','welcome'])assert.ok(readFileSync(new URL(type+'.hbs',root),'utf8').length>20);
console.log(JSON.stringify({status:'PASS',checks:['compiled payment receipt renders currency and escapes input','verification, reset and welcome HTML packaged'],external_requests:0}));
