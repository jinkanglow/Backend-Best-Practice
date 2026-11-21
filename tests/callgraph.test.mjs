import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {analyze} from '../lib/analyzer.mjs';
function fixture(fn){const dir=mkdtempSync(path.join(tmpdir(),'bg-calls-'));try{fn(dir)}finally{rmSync(dir,{recursive:true,force:true})}}
test('cross-file aliased symbol resolves function target',()=>fixture(dir=>{
 writeFileSync(path.join(dir,'a.ts'),"export function charge(){ return 1; }");
 writeFileSync(path.join(dir,'b.ts'),"import {charge as pay} from './a'; export function run(){return pay();}");
 const graph=analyze(dir).call_graph;
 assert.ok(graph.edges.some(e=>e.expression==='pay' && graph.nodes.find(n=>n.id===e.to)?.name==='charge'));
}));
test('unresolved indirect call does not become verified edge',()=>fixture(dir=>{
 writeFileSync(path.join(dir,'a.ts'),"export function run(callback:()=>void){callback();}");
 const graph=analyze(dir).call_graph;
 assert.ok(graph.unresolved.some(e=>e.expression==='callback'));
 assert.ok(!graph.edges.some(e=>e.expression==='callback'));
}));
test('function expression and direct call are resolved',()=>fixture(dir=>{
 writeFileSync(path.join(dir,'a.ts'),"const work=()=>42; export function run(){return work();}");
 const graph=analyze(dir).call_graph;
 assert.ok(graph.edges.some(e=>e.expression==='work' && graph.nodes.find(n=>n.id===e.to)?.name==='work'));
}));
test('calls inside arrow function belong to arrow caller',()=>fixture(dir=>{
 writeFileSync(path.join(dir,'a.ts'),"function work(){}; const run=()=>work();");
 const graph=analyze(dir).call_graph;
 const edge=graph.edges.find(e=>e.expression==='work');
 assert.equal(graph.nodes.find(n=>n.id===edge.from)?.name,'run');
}));
