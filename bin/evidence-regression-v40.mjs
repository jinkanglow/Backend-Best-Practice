#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {createEvidenceBaseline,compareEvidenceBaseline} from '../lib/evidence-regression-v40.mjs';
try{
 const [mode,manifestPath,reportPath,environmentPath,baselinePath,outputPath]=process.argv.slice(2);
 if(!['create','compare'].includes(mode)||!manifestPath||!reportPath||!environmentPath||!baselinePath)throw Error('Usage: evidence-regression-v40.mjs create|compare MANIFEST REPORT ENVIRONMENT BASELINE [OUTPUT]');
 const read=path=>JSON.parse(readFileSync(path,'utf8'));
 const args={manifest:read(manifestPath),report:read(reportPath),environment:read(environmentPath)};
 const result=mode==='create'?createEvidenceBaseline(args):compareEvidenceBaseline(read(baselinePath),args);
 const target=mode==='create'?baselinePath:outputPath;
 if(target)writeFileSync(target,JSON.stringify(result,null,2)+'\n');else process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(mode==='compare')process.exitCode=result.exit_code;
}catch(error){process.stderr.write(`Evidence regression: ${error.message}\n`);process.exitCode=2;}
