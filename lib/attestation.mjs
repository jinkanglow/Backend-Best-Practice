import crypto from 'node:crypto';
import fs from 'node:fs';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const canonical=x=>{if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x)};
export function attest(execution,{privateKey,runnerId,runId,manifestHash,environment}={}){
 if(!privateKey||!runnerId||!runId||!manifestHash||!environment?.image_digest)throw Error('Runner identity, run ID, manifest hash, image digest and key required');
 if(execution?.manifest_sha256!==manifestHash)throw Error('Execution manifest hash mismatch');
 const claims={schema_version:'2.1',runner_id:runnerId,run_id:runId,manifest_sha256:manifestHash,execution_sha256:hash(canonical(execution)),environment,issued_at:new Date().toISOString()};
 return {claims,execution,signature:crypto.sign(null,Buffer.from(canonical(claims)),privateKey).toString('base64'),algorithm:'Ed25519'};
}
export function verifyAttestation(envelope,{trustedRunners,expectedManifestHash,expectedImageDigest,seenRunIds=new Set(),maxAgeMs=3600000,now=Date.now()}={}){
 const errors=[];const c=envelope?.claims;
 if(envelope?.algorithm!=='Ed25519'||!c||c.schema_version!=='2.1')return {valid:false,errors:['invalid_envelope']};
 const key=trustedRunners?.[c.runner_id];if(!key)errors.push('untrusted_runner');
 if(!c.run_id||seenRunIds.has(c.run_id))errors.push('replayed_or_missing_run_id');
 const t=Date.parse(c.issued_at);if(!Number.isFinite(t)||t>now+60000||now-t>maxAgeMs)errors.push('expired_or_invalid_time');
 if(!expectedManifestHash||c.manifest_sha256!==expectedManifestHash||envelope.execution?.manifest_sha256!==expectedManifestHash)errors.push('manifest_mismatch');
 if(!expectedImageDigest||c.environment?.image_digest!==expectedImageDigest)errors.push('environment_mismatch');
 if(hash(canonical(envelope.execution))!==c.execution_sha256)errors.push('execution_tampered');
 try{if(!key||!crypto.verify(null,Buffer.from(canonical(c)),key,Buffer.from(envelope.signature||'','base64')))errors.push('invalid_signature')}catch{errors.push('invalid_signature')}
 return {valid:errors.length===0,errors,runner_id:c.runner_id,run_id:c.run_id};
}
export function readTrustedRunners(filename){const o=JSON.parse(fs.readFileSync(filename,'utf8'));if(!o||typeof o!=='object'||Array.isArray(o))throw Error('Invalid trust store');return o;}
export function canonicalHash(value){return hash(canonical(value))}
export function legacyManifestHash(value){return hash(JSON.stringify(value))}
