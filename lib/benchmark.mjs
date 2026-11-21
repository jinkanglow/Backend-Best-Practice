import {compareArchitecture} from './architecture-baseline.mjs';
import {architectureMetrics} from './architecture-metrics.mjs';
const labels=new Set(['fail','pass','insufficient_evidence']);
export function runBenchmark(corpus){
 if(corpus?.schema_version!=='2.4'||!Array.isArray(corpus.cases)||!corpus.cases.length||corpus.cases.length>10000)throw Error('Invalid benchmark corpus');
 const ids=new Set(),cases=[];let tp=0,fp=0,fn=0,tn=0,unknown=0;
 for(const c of corpus.cases){
  if(typeof c.id!=='string'||!c.id||ids.has(c.id)||!labels.has(c.expected)||!c.current?.dependency_graph||!c.baseline?.dependency_graph)throw Error('Invalid benchmark case');ids.add(c.id);
  const actual=compareArchitecture(c.current,c.baseline,{require_complete:c.require_complete!==false,max_new_cycles:c.max_new_cycles??0});
  const observed=actual.status==='fail'?'fail':actual.status==='insufficient_evidence'?'insufficient_evidence':'pass';
  if(observed==='insufficient_evidence'||c.expected==='insufficient_evidence')unknown++;
  else if(observed==='fail'&&c.expected==='fail')tp++;
  else if(observed==='fail')fp++;
  else if(c.expected==='fail')fn++;
  else tn++;
  cases.push({id:c.id,expected:c.expected,observed,matched:c.expected===observed,reason:actual.reason??null});
 }
 const precision=tp+fp?tp/(tp+fp):null,recall=tp+fn?tp/(tp+fn):null;
 return {schema_version:'2.4',scope:'labeled architecture cycle-regression fixtures only; not general backend security accuracy',cases,summary:{total:cases.length,matched:cases.filter(c=>c.matched).length,tp,fp,fn,tn,unknown,precision,recall,accuracy:cases.filter(c=>c.matched).length/cases.length}};
}
export function auditControlCoverage(catalog,detectors){
 if(!Array.isArray(catalog)||!Array.isArray(detectors))throw Error('Invalid coverage inputs');
 const ids=new Set(catalog.map(c=>c.id));const claimed=new Map();const rejected=[];
 for(const d of detectors){if(!d||typeof d.id!=='string'||!Array.isArray(d.control_ids)||!['implemented','candidate','planned'].includes(d.status)){rejected.push({id:d?.id??null,reason:'invalid_detector'});continue;}for(const id of d.control_ids){if(!ids.has(id)){rejected.push({id:d.id,control_id:id,reason:'unknown_control'});continue;}if(!claimed.has(id))claimed.set(id,[]);claimed.get(id).push({id:d.id,status:d.status});}}
 const controls=catalog.map(c=>({id:c.id,detectors:claimed.get(c.id)||[],coverage:(claimed.get(c.id)||[]).some(d=>d.status==='implemented')?'detector_declared_not_validated':'unimplemented'}));
 return {schema_version:'2.4',total:controls.length,declared_implemented:controls.filter(c=>c.coverage==='detector_declared_not_validated').length,unimplemented:controls.filter(c=>c.coverage==='unimplemented').length,rejected,controls,warning:'Detector declaration is not evidence of rule correctness or control compliance'};
}
