import {architectureMetrics} from './architecture-metrics.mjs';
const key=c=>JSON.stringify([...c].sort());
/** Compare cycle regressions, not absolute architecture compliance. */
export function compareArchitecture(current,baseline,{max_new_cycles=0,require_complete=true}={}){
 if(!Number.isInteger(max_new_cycles)||max_new_cycles<0)throw Error('max_new_cycles must be nonnegative integer');
 const currentMetrics=architectureMetrics(current),baselineMetrics=architectureMetrics(baseline);
 if(currentMetrics.status==='unknown'||baselineMetrics.status==='unknown')return {status:'insufficient_evidence',exit_code:2,reason:'analysis_budget_exhausted',current:currentMetrics,baseline:baselineMetrics};
 if(require_complete&&(currentMetrics.status!=='observed'||baselineMetrics.status!=='observed'))return {status:'insufficient_evidence',exit_code:2,reason:'unresolved_dependencies',current:currentMetrics,baseline:baselineMetrics};
 const old=new Set(baselineMetrics.cycles.map(key));const newCycles=currentMetrics.cycles.filter(c=>!old.has(key(c)));
 return {status:newCycles.length>max_new_cycles?'fail':currentMetrics.status==='partial'||baselineMetrics.status==='partial'?'pass_with_incomplete_graph':'pass_no_new_cycles',exit_code:newCycles.length>max_new_cycles?1:0,new_cycles:newCycles,existing_cycles:currentMetrics.cycles.filter(c=>old.has(key(c))),removed_cycles:baselineMetrics.cycles.filter(c=>!new Set(currentMetrics.cycles.map(key)).has(key(c))),max_new_cycles,scope:'cycle regression only; does not certify module boundaries or dependency completeness'};
}
