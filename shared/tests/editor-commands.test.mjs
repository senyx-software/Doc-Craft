import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyEditorOperations,editorContext,resolveEditorCommand} from '../editor-commands.mjs';
import {safeLanguageCorrection,validateLanguageCorrection} from '../language-corrections.mjs';
const context={elements:[{id:'header_title',type:'text',label:'Invoice',x:30,y:40,w:200,h:40,fontSize:24},{id:'client_name',type:'text',label:'Customer',x:30,y:80,w:200,h:20,fontSize:12}],selectedIds:[]};
test('heading color resolves with exact evidence and no invented target',()=>{
 const message='Actually change the customer to Alex and make the invoice heading blue.';
 const result=resolveEditorCommand(message,{editorContext:context});assert.equal(result.operations.length,1);assert.match(result.remaining,/change the customer to Alex/);
 const edited=applyEditorOperations({},context,result.operations,message);assert.equal(edited.layout.elementOverrides.header_title.color,'#0000ff');
});
test('make it bigger needs a selected element and never guesses a heading',()=>{
 assert.match(resolveEditorCommand('Make it bigger.',{editorContext:context}).clarification,/Which element/);
 const selected={...context,selectedIds:['client_name']},operation=resolveEditorCommand('Make it bigger.',{editorContext:selected});
 const result=applyEditorOperations({},selected,operation.operations,'Make it bigger.');assert.equal(result.layout.elementOverrides.client_name.fontSize,14.399999999999999);
});
test('visual batch validation is atomic to callers and does not mutate the source layout',()=>{
 const source={elementOverrides:{header_title:{x:40}}};
 assert.throws(()=>applyEditorOperations(source,context,[{operation:'update',target:{kind:'heading'},patch:{color:'#0000ff',x:200},evidence:'make the heading blue'}],'make the heading blue'));
 assert.deepEqual(source,{elementOverrides:{header_title:{x:40}}});
});
test('tool cannot claim unrequested colors, semantic text, unsupported code or foreign IDs',()=>{
 for(const patch of [{color:'#ff0000'},{text:'Forged'},{onclick:'execute()'},{fontSize:NaN}])assert.throws(()=>applyEditorOperations({},context,[{operation:'update',target:{kind:'heading'},patch,evidence:'make the heading blue'}],'make the heading blue'));
 assert.throws(()=>editorContext({...context,selectedIds:['foreign']}));
});
test('grammar preserves delivery meaning, numeric facts and proper names',()=>{
 assert.equal(safeLanguageCorrection('Plase delivary the prodcts within seven days.'),'Please deliver the products within seven days.');
 const state={slots:{businessName:'Teh Company',clientName:'Alex'}};
 const corrected=validateLanguageCorrection({field:null,original:'Plase delivary the prodcts within seven days.',suggested:'Please deliver the products within seven days.',reason:'Spelling'},state,'Plase delivary the prodcts within seven days.');assert.equal(corrected.automatic,false);
 assert.throws(()=>validateLanguageCorrection({field:'notesAndTerms',original:'Pay Alex 100 within 7 days',suggested:'Pay Bob 200 within 7 days',reason:'Grammar'},state,'Pay Alex 100 within 7 days'));
 assert.throws(()=>validateLanguageCorrection({field:null,original:'Send to Alex',suggested:'Send to Bob',reason:'Grammar'},state,'Send to Alex'));
});

test('language correction preserves known brands regardless of source capitalization',()=>{
 assert.equal(safeLanguageCorrection('Please send teh products to Teh Company.',['Teh Company']),'Please send teh products to Teh Company.');
});

test('singular visual references clarify when several elements are selected',()=>{
 const selected={...context,selectedIds:['header_title','client_name']};
 assert.match(resolveEditorCommand('Make it bigger.',{editorContext:selected}).clarification,/Which element/);
 assert.throws(()=>applyEditorOperations({},selected,[{operation:'update',target:{kind:'selected'},patch:{scale:1.2},evidence:'Make it bigger'}],'Make it bigger.'));
});
