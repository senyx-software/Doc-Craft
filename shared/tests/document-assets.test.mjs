import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assetElements,placeAsset,validAsset} from '../document-assets.mjs';
import {modelTaskState} from '../model-context.mjs';

const asset={id:'asset_test',role:'logo',name:'logo.png',width:400,height:100,src:'data:image/png;base64,iVBORw0KGgo='};
test('asset contract rejects active content, remote images, oversized payloads and invalid dimensions',()=>{
 assert.equal(validAsset(asset),true);
 for(const patch of [{src:'data:image/svg+xml,<svg/>'},{src:'https://example.com/logo.png'},{src:asset.src+'a'.repeat(160000)},{width:0},{height:1025},{role:'script'}])assert.equal(validAsset({...asset,...patch}),false);
});
test('logo placement preserves aspect ratio and fits the first available header space',()=>{
 const box=placeAsset(asset,[{type:'text',text:'Invoice',x:40,y:40,w:300,h:30},{type:'text',text:'INV1',x:400,y:40,w:150,h:65}]);
 assert.equal(box.w/box.h,4);assert.ok(box.y>=78&&box.y<180);assert.ok(box.x>=0&&box.x+box.w<=595);
});
test('artwork on crowded pages goes to a new page without covering content',()=>{
 const box=placeAsset({...asset,role:'image'},[{type:'table',x:0,y:0,w:595,h:842}]);
 assert.ok(box.y>=842);assert.equal(box.w/box.h,4);
});
test('decorative page backgrounds do not prevent image placement',()=>{
 const box=placeAsset(asset,[{type:'rect',x:0,y:0,w:595,h:842},{type:'rect',x:0,y:0,w:24,h:842}]);
 assert.ok(box.y<180);assert.ok(box.x>24);
});
test('multiple assets occupy different free areas',()=>{
 const placed=assetElements([asset,{...asset,id:'asset_image',role:'image'},{...asset,id:'asset_signature',role:'signature'}],[]);
 for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
   const a=placed[i],b=placed[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
 }
});
test('provider context sees artwork labels but never its base64 image data',()=>{
 const state=modelTaskState({documentType:'invoice',slots:{businessName:'Nexora'},assets:[asset],fieldStates:{}});
 assert.equal(state.assets[0].role,'logo');assert.ok(!JSON.stringify(state).includes('base64'));
});
