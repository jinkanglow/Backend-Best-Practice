const slash=s=>String(s).replaceAll('\\','/');
/** Deterministic, iterative Kosaraju SCC analysis; no recursive stack exhaustion. */
export function architectureMetrics(report,{max_nodes=50000,max_edges=200000}={}){
 const raw=report?.dependency_graph?.edges;
 if(!Array.isArray(raw))throw Error('dependency_graph.edges must be an array');
 const extra=report?.dependency_graph?.unresolved??[];
 if(!Array.isArray(extra))throw Error('dependency_graph.unresolved must be an array');
 if(raw.length>max_edges)return {status:'unknown',reason:'edge_budget_exceeded',observed_edges:raw.length};
 const nodes=new Set(),adj=new Map(),rev=new Map(),unresolved=new Set();
 for(const e of raw){if(typeof e?.from!=='string'||!e.from.trim())continue;const from=slash(e.from);nodes.add(from);
  if(typeof e.to!=='string'||!e.to.trim()){unresolved.add(JSON.stringify([from,e.specifier??null]));continue;}
  const to=slash(e.to);nodes.add(to);if(!adj.has(from))adj.set(from,new Set());adj.get(from).add(to);
  if(!rev.has(to))rev.set(to,new Set());rev.get(to).add(from);
 }
 for(const e of extra){if(typeof e?.from==='string')unresolved.add(JSON.stringify([slash(e.from),e.specifier??null]));}
 if(nodes.size>max_nodes)return {status:'unknown',reason:'node_budget_exceeded',observed_nodes:nodes.size};
 const ordered=[...nodes].sort(),visited=new Set(),finish=[];
 for(const root of ordered){if(visited.has(root))continue;visited.add(root);const stack=[[root,0,[...(adj.get(root)||[])].sort()]];
  while(stack.length){const top=stack[stack.length-1];if(top[1]===top[2].length){finish.push(top[0]);stack.pop();continue;}
   const next=top[2][top[1]++];if(!visited.has(next)){visited.add(next);stack.push([next,0,[...(adj.get(next)||[])].sort()]);}
  }
 }
 visited.clear();const components=[];
 for(const root of finish.reverse()){if(visited.has(root))continue;const component=[],stack=[root];visited.add(root);
  while(stack.length){const v=stack.pop();component.push(v);for(const next of [...(rev.get(v)||[])].sort().reverse())if(!visited.has(next)){visited.add(next);stack.push(next);}}
  components.push(component.sort());
 }
 const cycles=components.filter(c=>c.length>1||(c.length===1&&adj.get(c[0])?.has(c[0]))).sort((a,b)=>a[0].localeCompare(b[0]));
 const indegree=Object.fromEntries(ordered.map(n=>[n,0]));for(const targets of adj.values())for(const to of targets)indegree[to]++;
 return {status:unresolved.size?'partial':'observed',scope:'resolved graph edges only; absent cycles do not prove complete project coverage',node_count:nodes.size,edge_count:[...adj.values()].reduce((n,s)=>n+s.size,0),unresolved_count:unresolved.size,cycles,highest_fan_in:Object.entries(indegree).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10).map(([module,count])=>({module,count}))};
}
