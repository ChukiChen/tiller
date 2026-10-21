import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, link } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import {
  BUILTIN_WORKFLOW_IDS, WORKFLOW_FACTS, WORKFLOW_ACTIONS, WORKFLOW_LIMITS,
  loadBuiltinWorkflows, loadProjectWorkflows, parseWorkflowDefinition, parseWorkflowJson,
  createWorkflowSnapshot, parseWorkflowSnapshot, workflowDefinitionDigest,
  assertWorkflowVersionConsistency, evaluateWorkflowCondition, resolveWorkflowApplicability,
} from '../dist/workflow-catalog.js';

const catalog = await loadBuiltinWorkflows();
const definitions = new Map(catalog.map(snapshot => [snapshot.id, snapshot.definition]));
const copy = id => structuredClone(definitions.get(id));
const stage = (id, changes = {}) => ({id, title:id, dependsOn:[], consumes:[], produces:[], checks:['实际证据'], confirmations:[], actions:['read'], ...changes});
const condition = (fact, equals = true) => ({fact, equals});
const allFalse = Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact,false]));
const confirmations = definition => definition.stages.flatMap(item => item.confirmations);
const actions = definition => definition.stages.flatMap(item => item.actions);
function projectDefinition() { const definition=copy('analysis'); definition.id='project.audit'; return definition; }
async function temporary(t) {
  const root=await mkdtemp(path.join(os.tmpdir(),'tiller-workflow-'));
  t.after(async () => {
    assert.equal(path.dirname(root),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('tiller-workflow-'));
    await rm(root,{recursive:true,force:true});
  });
  await mkdir(path.join(root,'.tiller','workflows'),{recursive:true});
  return root;
}
async function put(root, definition, filename=`${definition.id}@${definition.version}.json`) {
  await writeFile(path.join(root,'.tiller','workflows',filename),JSON.stringify(definition));
}

// Stable names are referenced by the long-term verification catalog.
test('workflow catalog: eleven distinct built-in contracts and immutable snapshots', async () => {
  assert.deepEqual(catalog.map(value=>value.id), [...BUILTIN_WORKFLOW_IDS]);
  assert.equal(new Set(catalog.map(value=>value.digest)).size,11);
  for(const snapshot of catalog) {
    assert.equal(snapshot.version,'1.0.0');
    assert.equal(snapshot.digest,workflowDefinitionDigest(snapshot.definition));
    assert.ok(Object.isFrozen(snapshot.definition.stages[0].actions));
    assert.throws(()=>{snapshot.definition.stages[0].actions.push('release');},TypeError);
    assert.ok(snapshot.definition.appliesTo[0]);
    assert.ok(snapshot.definition.notApplicableTo[0]);
    assert.ok(snapshot.definition.completion.checks[0].includes('授权'));
  }
  assert.deepEqual(await loadBuiltinWorkflows(),catalog);
});
test('workflow requirements: confirmed requirements end without design or implementation',()=>{
  const definition=definitions.get('requirements');
  assert.equal(definition.completion.result,'requirements-confirmed');
  assert.deepEqual(confirmations(definition),['requirements']);
  assert.ok(!actions(definition).includes('edit-code'));
  assert.deepEqual(definition.stages.map(value=>value.id),['clarify','requirements']);
});
test('workflow analysis: evidence and hypotheses produce report without repair authority',()=>{
  const definition=definitions.get('analysis');
  assert.deepEqual(definition.stages.map(value=>value.id),['scope','evidence','hypotheses','report']);
  assert.equal(definition.completion.result,'report-delivered');
  assert.deepEqual(confirmations(definition),[]);
  assert.deepEqual([...new Set(actions(definition))],['read','write-report']);
  assert.ok(definition.outputs.some(value=>value.role==='analysis'));
});
test('workflow research: local experiments and side-effect authorization are separate branches',()=>{
  const definition=definitions.get('research');
  assert.equal(resolveWorkflowApplicability(definition,allFalse).stages['experiment-plan'],'not-applicable');
  for(const fact of ['experimentSideEffects','production','writesData','credentials','irreversible','externalService']) {
    assert.equal(resolveWorkflowApplicability(definition,{...allFalse,[fact]:true}).stages['experiment-plan'],'applicable');
  }
  assert.equal(resolveWorkflowApplicability(definition,{}).stages['experiment-plan'],'unresolved');
  assert.deepEqual(definition.stages.find(value=>value.id==='experiment-plan').confirmations,['operation']);
  assert.ok(actions(definition).includes('local-experiment'));
  assert.ok(!actions(definition).includes('edit-code'));
});
test('workflow feature: requirements design planning precede implementation and verification',()=>{
  const definition=definitions.get('feature');
  assert.deepEqual(definition.stages.map(value=>value.id),['requirements','design','planning','implementation','verification']);
  assert.deepEqual(confirmations(definition),['requirements','design','planning']);
  assert.deepEqual(definition.stages.find(value=>value.id==='implementation').dependsOn,['planning']);
  assert.ok(definition.stages.find(value=>value.id==='implementation').checks[0].includes('task start/verify/resume'));
  assert.equal(definition.completion.result,'change-verified');
});
test('workflow bugfix: read-only diagnosis precedes explicit development gates and regression',()=>{
  const definition=definitions.get('bugfix');
  assert.deepEqual(definition.stages.slice(0,2).map(value=>value.id),['reproduce','cause']);
  assert.ok(definition.stages.slice(0,2).every(value=>value.confirmations.length===0&&!value.actions.includes('edit-code')));
  assert.deepEqual(confirmations(definition),['requirements','design','planning']);
  assert.ok(definition.stages.at(-1).checks.some(value=>value.includes('原缺陷')));
});
test('workflow improvement: baseline and behavior or measured performance comparison are required',()=>{
  const definition=definitions.get('improvement');
  assert.equal(definition.stages[0].id,'baseline');
  assert.ok(definition.stages[0].checks[0].includes('改动前'));
  assert.ok(definition.stages.at(-1).checks.some(value=>value.includes('实测前后比较')));
  assert.deepEqual(confirmations(definition),['requirements','design','planning']);
});
test('workflow review: findings are rechecked without automatic correction or acceptance',()=>{
  const definition=definitions.get('review');
  assert.deepEqual(definition.stages.map(value=>value.id),['scope','inspection','recheck','report']);
  assert.equal(definition.completion.result,'report-delivered');
  assert.deepEqual(confirmations(definition),[]);
  assert.ok(!actions(definition).includes('edit-code'));
  assert.ok(definition.stages.at(-1).checks[0].includes('未覆盖'));
});
test('workflow validation: technical coverage and user acceptance remain distinct',()=>{
  const definition=definitions.get('validation');
  assert.equal(definition.completion.result,'report-delivered');
  assert.ok(!confirmations(definition).includes('acceptance'));
  assert.equal(resolveWorkflowApplicability(definition,{...allFalse,writesData:true}).stages['test-authorization'],'applicable');
  assert.equal(resolveWorkflowApplicability(definition,{}).stages['test-authorization'],'unresolved');
  assert.ok(definition.stages.at(-1).checks[0].includes('用户接受'));
});
test('workflow documentation: semantic changes require development confirmations and unknown is unresolved',()=>{
  const definition=definitions.get('documentation');
  for(const id of ['requirements','design','planning']) {
    assert.equal(resolveWorkflowApplicability(definition,allFalse).stages[id],'not-applicable');
    assert.equal(resolveWorkflowApplicability(definition,{}).stages[id],'unresolved');
    for(const fact of ['semanticChange','changesBehavior','modifiesCode']) assert.equal(resolveWorkflowApplicability(definition,{...allFalse,[fact]:true}).stages[id],'applicable');
  }
  assert.ok(actions(definition).includes('edit-documents'));
  assert.ok(!actions(definition).includes('edit-code'));
});
test('workflow migration: target design planning and concrete operation gates retain recovery limits',()=>{
  const definition=definitions.get('migration');
  assert.deepEqual(confirmations(definition),['requirements','design','planning','operation']);
  assert.ok(definition.stages.find(value=>value.id==='operation').checks[0].includes('不擅自执行回滚'));
  assert.equal(definition.stages.at(-1).id,'verification');
});
test('workflow operations: release binds acceptance and release while maintenance requires operation',()=>{
  const definition=definitions.get('operations');
  const release=resolveWorkflowApplicability(definition,{release:true});
  assert.equal(release.stages.release,'applicable');
  assert.equal(release.stages.operation,'not-applicable');
  const maintenance=resolveWorkflowApplicability(definition,{release:false});
  assert.equal(maintenance.stages.release,'not-applicable');
  assert.equal(maintenance.stages.operation,'applicable');
  assert.deepEqual(resolveWorkflowApplicability(definition,{}).unresolvedStages,['release','operation']);
  assert.deepEqual(definition.stages.find(value=>value.id==='release').confirmations,['acceptance','release']);
  assert.deepEqual(definition.stages.find(value=>value.id==='operation').confirmations,['operation']);
  assert.equal(definition.completion.result,'operation-observed');
});

test('workflow conditions: closed boolean three-state logic never negates unknown to false',()=>{
  const yes=condition('production');
  assert.equal(evaluateWorkflowCondition(yes,{}),'unresolved');
  assert.equal(evaluateWorkflowCondition({not:yes},{production:'unknown'}),'unresolved');
  assert.equal(evaluateWorkflowCondition({not:yes},{production:false}),'applicable');
  assert.equal(evaluateWorkflowCondition({all:[yes,condition('release')]},{production:false}),'not-applicable');
  assert.equal(evaluateWorkflowCondition({all:[yes,condition('release')]},{production:true}),'unresolved');
  assert.equal(evaluateWorkflowCondition({any:[yes,condition('release')]},{production:true}),'applicable');
  assert.equal(evaluateWorkflowCondition({any:[yes,condition('release')]},{production:false}),'unresolved');
  assert.throws(()=>evaluateWorkflowCondition(yes,{production:undefined}),/unknown/);
  assert.throws(()=>evaluateWorkflowCondition(yes,{arbitrary:true}),/未知/);
});

const invalidDefinitions=[
  ['unknown root field',d=>{d.script='touch file';}],
  ['unsupported schema',d=>{d.schemaVersion=2;}],
  ['unreserved identifier',d=>{d.id='arbitrary';}],
  ['path identifier',d=>{d.id='project.../escape';}],
  ['mutable version',d=>{d.version='latest';}],
  ['unknown stage field',d=>{d.stages[0].command='echo unsafe';}],
  ['unknown action',d=>{d.stages[0].actions=['shell'];}],
  ['unknown confirmation',d=>{d.stages[0].confirmations=['auto-approved'];}],
  ['unknown completion field',d=>{d.completion.accepted=true;}],
  ['unknown completion result',d=>{d.completion.result='accepted';}],
  ['duplicate stage',d=>{d.stages.push(structuredClone(d.stages[0]));}],
  ['duplicate output',d=>{d.outputs.push(structuredClone(d.outputs[0]));}],
  ['duplicate dependency',d=>{d.stages[1].dependsOn.push(d.stages[1].dependsOn[0]);}],
  ['dangling dependency',d=>{d.stages[0].dependsOn=['missing'];}],
  ['self cycle',d=>{d.stages[0].dependsOn=[d.stages[0].id];}],
  ['multi-stage cycle',d=>{d.stages[0].dependsOn=[d.stages.at(-1).id];}],
  ['unknown produced artifact',d=>{d.stages[0].produces.push('missing');}],
  ['producer mismatch',d=>{d.outputs[0].producer=d.stages[1].id;}],
  ['unknown consumed artifact',d=>{d.stages[1].consumes=['missing'];}],
  ['consuming own artifact',d=>{d.stages[0].consumes=[d.outputs[0].id];}],
  ['consumer without dependency',d=>{d.stages[1].dependsOn=[];}],
  ['orphan stage',d=>{d.stages.push(stage('orphan'));}],
  ['missing ending',d=>{d.completion.requiredStages=[];}],
  ['unknown ending',d=>{d.completion.requiredStages=['missing'];}],
  ['missing output',d=>{d.completion.requiredOutputs=[];}],
  ['unknown completion output',d=>{d.completion.requiredOutputs=['missing'];}],
  ['unknown fact',d=>{d.stages[0].when={fact:'random',equals:true};}],
  ['string boolean',d=>{d.stages[0].when={fact:'production',equals:'false'};}],
  ['empty condition',d=>{d.stages[0].when={};}],
  ['empty all',d=>{d.stages[0].when={all:[]};}],
  ['extra operator',d=>{d.stages[0].when={fact:'production',equals:true,not:condition('release')};}],
  ['dead condition',d=>{d.stages[0].when={all:[condition('production'),condition('production',false)]};}],
  ['conditional producer unsafe for consumer',d=>{d.stages[0].when=condition('production');}],
  ['release missing protected confirmation',d=>{d.stages[0].actions=['release'];}],
  ['merge missing protected confirmation',d=>{d.stages[0].actions=['merge'];}],
];
for(const [name,mutate] of invalidDefinitions) test(`workflow rejection: ${name}`,()=>{
  const definition=copy('analysis'); mutate(definition); assert.throws(()=>parseWorkflowDefinition(definition));
});
test('workflow graph: conditional outputs cannot leave a completion branch empty',()=>{
  const definition=copy('operations');
  definition.completion.requiredOutputs=['release-output'];
  // Other branch outputs are also consumed nowhere: retain closure before testing empty delivery.
  definition.outputs=definition.outputs.filter(value=>value.id==='release-output');
  for(const current of definition.stages) { current.produces=current.produces.filter(id=>id==='release-output'); current.consumes=[]; }
  assert.throws(()=>parseWorkflowDefinition(definition),/没有必要交付产物/);
});
test('workflow graph: every condition must reach an ending and matching producer',()=>{
  const definition=copy('operations');
  definition.completion.requiredStages=['release'];
  assert.throws(()=>parseWorkflowDefinition(definition),/无法到达结束/);
  const valid=copy('operations');
  valid.stages.find(value=>value.id==='release').consumes=['preflight-output'];
  assert.equal(parseWorkflowDefinition(valid).id,'operations');
  valid.stages.find(value=>value.id==='operation').consumes=['release-output'];
  valid.stages.find(value=>value.id==='operation').dependsOn=['release'];
  assert.throws(()=>parseWorkflowDefinition(valid),/条件分支/);
});
test('workflow bounds: condition recursion nodes lists text and bytes are bounded',()=>{
  let deep=condition('production');
  for(let i=0;i<WORKFLOW_LIMITS.conditionDepth+1;i++) deep={not:deep};
  assert.throws(()=>evaluateWorkflowCondition(deep,{}),/深度/);
  assert.throws(()=>evaluateWorkflowCondition({all:Array.from({length:WORKFLOW_LIMITS.conditionNodes},()=>condition('production'))},{}),/节点/);
  const tooMany=copy('analysis');
  tooMany.stages=Array.from({length:WORKFLOW_LIMITS.stages+1},(_,i)=>stage(`step-${i}`));
  assert.throws(()=>parseWorkflowDefinition(tooMany),/数量/);
  const text=copy('analysis');text.title='x'.repeat(WORKFLOW_LIMITS.text+1);
  assert.throws(()=>parseWorkflowDefinition(text),/长度/);
  assert.throws(()=>parseWorkflowJson(' '.repeat(WORKFLOW_LIMITS.bytes+1)),/字节/);
  assert.throws(()=>parseWorkflowJson('{"schemaVersion":1'),/JSON/);
  const large=copy('analysis');
  large.appliesTo=Array.from({length:WORKFLOW_LIMITS.list},(_,i)=>`${i}${'界'.repeat(1000)}`);
  assert.throws(()=>parseWorkflowDefinition(large),/字节/);
});
test('workflow strict objects: prototype accessors and unknown policy fields are rejected',()=>{
  const definition=copy('analysis');
  assert.throws(()=>parseWorkflowDefinition(Object.assign(Object.create({approved:true}),definition)),/普通对象/);
  Object.defineProperty(definition,'title',{get(){throw new Error('getter ran');},enumerable:true});
  assert.throws(()=>parseWorkflowDefinition(definition),/访问器/);
  assert.throws(()=>parseWorkflowJson(JSON.stringify({...copy('analysis'),__proto__:null,policy:{approved:true}})),/未知/);
  assert.throws(()=>parseWorkflowJson(JSON.stringify(copy('analysis')).replace('"schemaVersion":1','"__proto__":{},"schemaVersion":1')),/未知/);
});
test('workflow snapshots: canonical key order all policies integrity and version conflicts',()=>{
  const definition=copy('analysis');
  const snapshot=createWorkflowSnapshot(definition);
  const reordered=Object.fromEntries(Object.entries(definition).reverse());
  assert.equal(workflowDefinitionDigest(reordered),snapshot.digest);
  definition.title='变化后的标题';
  assert.notEqual(workflowDefinitionDigest(definition),snapshot.digest);
  assert.notEqual(snapshot.definition.title,definition.title);
  assert.throws(()=>parseWorkflowSnapshot({...snapshot,digest:'0'.repeat(64)}),/不匹配/);
  assert.throws(()=>parseWorkflowSnapshot({...snapshot,version:'2.0.0'}),/不匹配/);
  assert.throws(()=>parseWorkflowSnapshot({...snapshot,approved:true}),/未知/);
  assert.throws(()=>assertWorkflowVersionConsistency([snapshot,createWorkflowSnapshot(definition)]),/同一流程版本/);
  definition.version='1.0.1';
  assert.doesNotThrow(()=>assertWorkflowVersionConsistency([snapshot,createWorkflowSnapshot(definition)]));
  for(const mutate of [d=>d.stages[0].checks.push('more'),d=>d.stages[0].actions.push('test'),d=>{d.stages[0].confirmations.push('scope');d.stages[0].confirmationAt='start';},d=>d.completion.checks.push('more'),d=>d.notApplicableTo.push('more')]) {
    const changed=copy('analysis');mutate(changed);assert.notEqual(workflowDefinitionDigest(changed),snapshot.digest);
  }
});

test('workflow project loading: safe versioned candidates do not activate or alter pinned snapshots',async t=>{
  const root=await temporary(t);
  const definition=projectDefinition();await put(root,definition);
  const candidates=await loadProjectWorkflows(root);
  assert.equal(candidates[0].status,'validated-candidate');
  assert.equal(candidates[0].path,'.tiller/workflows/project.audit@1.0.0.json');
  const pinned=candidates[0].snapshot;
  definition.title='后续变更';await put(root,definition);
  const newer=(await loadProjectWorkflows(root))[0].snapshot;
  assert.notEqual(pinned.digest,newer.digest);
  assert.throws(()=>assertWorkflowVersionConsistency([pinned,newer]),/同一流程版本/);
  definition.version='1.0.1';await put(root,definition);
  assert.equal((await loadProjectWorkflows(root)).length,2);
  assert.equal(parseWorkflowSnapshot(pinned).digest,pinned.digest);
});
test('workflow project loading: absent directory returns an empty catalog',async t=>{
  const root=await temporary(t);
  await rm(path.join(root,'.tiller','workflows'),{recursive:true});
  assert.deepEqual(await loadProjectWorkflows(root),[]);
});
for(const [name,filename,mutate] of [
  ['builtin override','project.audit@1.0.0.json',d=>{d.id='analysis';}],
  ['wrong version','project.audit@1.0.1.json',()=>{}],
  ['wrong id','project.other@1.0.0.json',()=>{}],
  ['script file','project.audit@1.0.0.js',()=>{}],
  ['case alias','Project.audit@1.0.0.json',()=>{}],
  ['unversioned file','project.audit.json',()=>{}],
]) test(`workflow project rejection: ${name}`,async t=>{
  const root=await temporary(t);const definition=projectDefinition();mutate(definition);await put(root,definition,filename);
  await assert.rejects(loadProjectWorkflows(root));
});
test('workflow project rejection: nested entries oversized files and invalid UTF-8',async t=>{
  const root=await temporary(t);const directory=path.join(root,'.tiller','workflows');
  await mkdir(path.join(directory,'nested'));
  await assert.rejects(loadProjectWorkflows(root),/普通文件/);
  await rm(path.join(directory,'nested'),{recursive:true});
  const file=path.join(directory,'project.audit@1.0.0.json');
  await writeFile(file,Buffer.alloc(WORKFLOW_LIMITS.bytes+1));
  await assert.rejects(loadProjectWorkflows(root),/大小/);
  await writeFile(file,Buffer.from([0xff,0xfe]));
  await assert.rejects(loadProjectWorkflows(root),/UTF-8/);
});
test('workflow project rejection: directory links and hardlinks never escape safe roots',async t=>{
  const root=await temporary(t);const outside=await temporary(t);
  const directory=path.join(root,'.tiller','workflows');
  const outsideDirectory=path.join(outside,'.tiller','workflows');
  await put(outside,projectDefinition());
  await rm(directory,{recursive:true});
  await symlink(outsideDirectory,directory,process.platform==='win32'?'junction':'dir');
  await assert.rejects(loadProjectWorkflows(root),/符号链接/);
  await rm(directory);
  await mkdir(directory);
  await link(path.join(outsideDirectory,'project.audit@1.0.0.json'),path.join(directory,'project.audit@1.0.0.json'));
  await assert.rejects(loadProjectWorkflows(root),/硬链接/);
});
test('workflow project bounds: count and aggregate input size are limited',async t=>{
  const root=await temporary(t);
  const large=projectDefinition();
  large.appliesTo=Array.from({length:100},(_,i)=>`${i}${'x'.repeat(1900)}`);
  for(let i=0;i<24;i++) { large.id=`project.entry-${i}`;await put(root,large); }
  await assert.rejects(loadProjectWorkflows(root),/总字节数/);
  for(let i=24;i<WORKFLOW_LIMITS.projectDefinitions+1;i++) { const definition=projectDefinition();definition.id=`project.entry-${i}`;await put(root,definition); }
  await assert.rejects(loadProjectWorkflows(root),/数量/);
});
test('workflow performance: maximum-size dependency graph remains bounded',t=>{
  const definition=projectDefinition();definition.stages=[];definition.outputs=[];
  for(let i=0;i<WORKFLOW_LIMITS.stages;i++) {
    definition.stages.push(stage(`step-${i}`,{dependsOn:Array.from({length:i},(_,j)=>`step-${j}`),produces:[`output-${i}`]}));
    definition.outputs.push({id:`output-${i}`,role:'report',title:`报告 ${i}`,producer:`step-${i}`});
  }
  definition.completion.requiredStages=[`step-${WORKFLOW_LIMITS.stages-1}`];
  definition.completion.requiredOutputs=definition.outputs.map(value=>value.id);
  const start=performance.now();
  for(let i=0;i<20;i++) parseWorkflowDefinition(definition);
  const elapsed=performance.now()-start;
  t.diagnostic(`20 maximum-stage dense DAG parses: ${elapsed.toFixed(1)} ms; ${WORKFLOW_LIMITS.stages} stages, 8128 edges`);
  assert.ok(elapsed<10000,`bounded parse took ${elapsed} ms`);
});

test('workflow confirmations: document approval follows preparation while operation approval precedes execution',()=>{
  for(const snapshot of catalog) for(const current of snapshot.definition.stages) {
    if(!current.confirmations.length) { assert.equal(current.confirmationAt,undefined);continue; }
    const operation=current.confirmations.some(gate=>['operation','release','merge'].includes(gate));
    assert.equal(current.confirmationAt,operation?'start':'verify');
  }
  const definition=copy('feature');delete definition.stages[0].confirmationAt;
  assert.throws(()=>parseWorkflowDefinition(definition),/枚举/);
  const operation=copy('operations');operation.stages.find(value=>value.id==='release').confirmationAt='verify';
  assert.throws(()=>parseWorkflowDefinition(operation),/必须先于/);
  const empty=copy('analysis');empty.stages[0].confirmationAt='verify';
  assert.throws(()=>parseWorkflowDefinition(empty),/没有确认/);
});
test('workflow baseline actions: authorized reproduction and improvement measurements allow tests',()=>{
  for(const id of ['reproduce','cause']) assert.ok(definitions.get('bugfix').stages.find(value=>value.id===id).actions.includes('test'));
  assert.ok(definitions.get('improvement').stages[0].actions.includes('test'));
  const research=definitions.get('research');
  assert.ok(research.stages[0].checks.some(value=>value.includes('业务或环境持久数据')));
  assert.equal(resolveWorkflowApplicability(research,allFalse).stages['experiment-plan'],'not-applicable');
  assert.equal(resolveWorkflowApplicability(research,{...allFalse,writesData:true}).stages['experiment-plan'],'applicable');
});
