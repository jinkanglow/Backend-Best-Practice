import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {analyze} from '../lib/analyzer.mjs';
function fixture(files,fn){const dir=mkdtempSync(path.join(tmpdir(),'bg-flow-'));try{for(const [file,body] of Object.entries(files))writeFileSync(path.join(dir,file),body);fn(analyze(dir));}finally{rmSync(dir,{recursive:true,force:true});}}
test('direct request body to raw sink yields candidate',()=>fixture({'a.ts':'declare function executeRawUnsafe(x:unknown):void; export function handler(req:any){executeRawUnsafe(req.body)}'},r=>assert.equal(r.dataflow.flows.length,1)));
test('cross-file argument propagation reaches sink',()=>fixture({'a.ts':'declare function executeRawUnsafe(x:unknown):void; export function store(x:unknown){executeRawUnsafe(x)}','b.ts':"import {store} from './a'; export function handler(req:any){store(req.body)}"},r=>assert.ok(r.dataflow.flows.some(f=>f.sink==='executeRawUnsafe'))));
test('constant input does not yield taint candidate',()=>fixture({'a.ts':'declare function executeRawUnsafe(x:unknown):void; export function handler(req:any){executeRawUnsafe("constant")}'},r=>assert.equal(r.dataflow.flows.length,0)));
test('unknown callee with tainted argument is reported as gap',()=>fixture({'a.ts':'export function handler(req:any, callback:(x:any)=>void){callback(req.body)}'},r=>assert.ok(r.dataflow.unknown.some(x=>x.reason==='tainted_argument_to_unresolved_call'))));
