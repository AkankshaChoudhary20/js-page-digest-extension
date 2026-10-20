import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('closing the panel aborts the upstream request',async()=>{
 let connect,run,disconnect,signal;const messages=[];
 const context={AbortController,TextDecoder,chrome:{runtime:{onConnect:{addListener(fn){connect=fn;}}},storage:{local:{get:async()=>({apiKey:'test'})}}},fetch:async(_url,options)=>{
  signal=options.signal;
  return await new Promise((_resolve,reject)=>{if(signal)signal.addEventListener('abort',()=>reject(new Error('aborted')));});
 }};
 vm.runInNewContext(readFileSync(new URL('../background/background.js',import.meta.url),'utf8'),context);
 connect({name:'page-digest-stream',onMessage:{addListener(fn){run=fn;}},onDisconnect:{addListener(fn){disconnect=fn;}},postMessage(m){messages.push(m);}});
 run({type:'run',text:'Page',mode:'summarize'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(signal,'fetch must receive a cancellation signal');assert.equal(signal.aborted,false);
 disconnect();assert.equal(signal.aborted,true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(!messages.some(m=>m.type==='done'));
});
