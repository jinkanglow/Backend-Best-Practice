import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base=path.resolve(import.meta.dirname,'..');
test('catalog has unique, structured controls',()=>{const data=JSON.parse(fs.readFileSync(path.join(base,'rules/control-catalog.json')));assert.equal(data.controls.length,85);assert.equal(new Set(data.controls.map(c=>c.id)).size,85);for(const c of data.controls){assert.equal(c.implementation,'specified_not_automated');assert.ok(c.required_evidence.length>0)}});
test('all reference domains exist',()=>{const data=JSON.parse(fs.readFileSync(path.join(base,'rules/control-catalog.json')));for(const cat of new Set(data.controls.map(c=>c.category)))assert.ok(fs.existsSync(path.join(base,'references',cat+'.md')))});
