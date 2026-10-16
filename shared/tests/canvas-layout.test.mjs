import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canvasLayout} from '../canvas-layout.mjs';
test('canvas presentation persists without overriding canonical semantic text',()=>{
 const layout=canvasLayout({elementOverrides:{businessName:{x:40,text:'forged business name',semanticField:'clientName'}},customElements:[{id:'label',type:'text',section:'custom',x:5,y:5,w:100,h:20,zIndex:1,text:'Custom note'}]});
 assert.deepEqual(layout.elementOverrides.businessName,{x:40});
 assert.equal(layout.customElements[0].text,'Custom note');
});
for(const layout of [{pageWidth:Infinity},{pageHeight:1},{elementOverrides:JSON.parse('{"__proto__":{"x":1}}')},{customElements:[{id:'img',type:'image',x:1,y:1,w:20,h:20,zIndex:1,src:'http://127.0.0.1/private'}]},{customElements:Array(101).fill({})}])test('invalid layout is rejected '+JSON.stringify(layout).slice(0,80),()=>assert.throws(()=>canvasLayout(layout)));
