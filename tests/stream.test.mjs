import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../background/background.js',import.meta.url),'utf8');
async function run(body){
  const messages=[];
  const context={chrome:{runtime:{onConnect:{addListener(){}}},storage:{local:{get:async()=>({apiKey:'test'})}}},TextDecoder,fetch:async()=>({ok:true,body})};
  vm.runInNewContext(source+'\nglobalThis.run=runDigest;',context);
  await context.run({postMessage:message=>messages.push(message)},{text:'Page',mode:'summarize'});
  return messages;
}
test('final unterminated event and split UTF-8 bytes are preserved',async()=>{
  const bytes=new TextEncoder().encode('data: '+JSON.stringify({type:'content_block_delta',delta:{type:'text_delta',text:'€ summary'}}));
  const body=new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(new Uint8Array([byte]));controller.close();}});
  const messages=await run(body);
  assert.equal(messages.at(-1).type,'done');assert.equal(messages.at(-1).fullText,'€ summary');
});
test('stream error cancels reading and never announces success',async()=>{
  let cancelled=false;
  const bytes=new TextEncoder().encode('data: '+JSON.stringify({type:'error',error:{message:'Upstream failed'}})+'\n');
  const body=new ReadableStream({start(controller){controller.enqueue(bytes);},cancel(){cancelled=true;}});
  const messages=await run(body);
  assert.equal(cancelled,true);assert.equal(messages.at(-1).type,'error');assert.ok(!messages.some(m=>m.type==='done'));
});
