import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('inherited mode names fall back to the summarize instruction',async()=>{
 let request;
 const context={chrome:{runtime:{onConnect:{addListener(){}}},storage:{local:{get:async()=>({apiKey:'test'})}}},TextDecoder,fetch:async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,body:new ReadableStream({start(c){c.close();}})};}};
 vm.runInNewContext(readFileSync(new URL('../background/background.js',import.meta.url),'utf8')+'\nglobalThis.run=runDigest;',context);
 for(const mode of ['constructor','toString','__proto__']){
  await context.run({postMessage(){}},{text:'Page text',mode});
  assert.match(request.messages[0].content,/^Summarize the following page content/);
  assert.ok(request.messages[0].content.endsWith('Page text'));
 }
});
