import test from 'node:test';
import assert from 'node:assert/strict';
import {architectureMetrics} from '../lib/architecture-metrics.mjs';
const report=edges=>({dependency_graph:{edges}});
test('SCC detects cycle with transitive edges',()=>{const x=architectureMetrics(report([{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'a'}]));assert.deepEqual(x.cycles,[['a','b','c']]);assert.equal(x.status,'observed')});
test('acyclic graph reports fan-in and no cycle',()=>{const x=architectureMetrics(report([{from:'a',to:'c'},{from:'b',to:'c'}]));assert.equal(x.cycles.length,0);assert.deepEqual(x.highest_fan_in[0],{module:'c',count:2})});
test('unresolved edge means partial observation',()=>{const x=architectureMetrics(report([{from:'a',specifier:'./missing',to:null}]));assert.equal(x.status,'partial');assert.equal(x.unresolved_count,1)});
test('budget exhaustion is unknown, not pass',()=>{const x=architectureMetrics(report([{from:'a',to:'b'},{from:'b',to:'c'}]),{max_edges:1});assert.equal(x.status,'unknown')});
test('self-loop is a cycle',()=>{const x=architectureMetrics(report([{from:'a',to:'a'}]));assert.deepEqual(x.cycles,[['a']])});
