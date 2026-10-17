import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { requestConfirmation, recordDecision, checkGate, inspectConfirmations, assertAcceptance } from '../dist/confirmations.js';
import { fixture, put, gitRepository } from './helpers.mjs';

const workId = 'student-service';
const directory = `.tiller/work/${workId}`;
const file = path => ({ repository: '.', path });
const subject = file(`${directory}/requirements.md`);
const evidence = file(`${directory}/verification.md`);
async function setup(t) {
  const root = fixture(t);
  await initialize({ root });
  put(root, `${directory}/work.md`, '# 学生服务\n\n目标为学生增删改查。\n');
  put(root, subject.path, '# 需求\n\n学号唯一，删除不存在的学生返回 false。\n');
  put(root, evidence.path, '# 验证\n\n本测试仅演示确认记录，不模拟真实人工批准。\n');
  return root;
}
function request(requestId, gate = 'requirements', overrides = {}) {
  return { requestId, gate, scope: { repositories: ['.'], targets: ['student-service'] }, subjects: [subject], upstream: [], reviewSummary: '学号唯一，明确不存在时的返回值。', openIssues: [], nextAction: gate === 'requirements' ? '设计学生接口' : '继续当前交付', ...overrides };
}
function decision(root, requestId, decisionId, outcome = 'approved', overrides = {}) {
  const reference = file(`${directory}/source-${decisionId}.md`);
  put(root, reference.path, '# 模拟用户输入\n\n同意本次展示的范围及内容。\n');
  return {
    decisionId, requestId, outcome, conditions: outcome === 'conditional' ? ['补充边界测试后再确认'] : [],
    source: { kind: 'conversation', reference, quote: '同意本次展示的范围及内容。', presentation: file(`${directory}/reviews/request-${requestId}/presentation.md`) },
    sourceReview: { reviewer: '测试执行者', rationale: '这是隔离测试夹具；记录指定请求展示内容和模拟原话的对应，不代表真实用户审批。', reviewedAt: '2026-10-15T00:00:00.000Z' },
    ...overrides,
  };
}

test('handwritten work supports pending, reviewed approval, scoped design and acceptance without automatic execution', async t => {
  const root = await setup(t);
  assert.equal((await requestConfirmation(root, workId, request('requirements'))).status, 'pending');
  const input = decision(root, 'requirements', 'approve-requirements');
  const approved = await recordDecision(root, workId, input);
  assert.equal(approved.confirmed, true);
  assert.equal(approved.confirmationBasis, 'reported-review');
  assert.equal(approved.sourceVerification, 'not-independently-verified');
  assert.equal(approved.automaticTransition, false);
  assert.equal((await recordDecision(root, workId, input)).changed, false);
  await requestConfirmation(root, workId, request('design', 'design', { upstream: ['requirements'] }));
  await recordDecision(root, workId, decision(root, 'design', 'approve-design'));
  await requestConfirmation(root, workId, request('acceptance', 'acceptance', { subjects: [subject, evidence], upstream: ['design'] }));
  await assert.rejects(assertAcceptance(root, workId, 'acceptance', subject.path, evidence.path), /验收尚未满足/u);
  await recordDecision(root, workId, decision(root, 'acceptance', 'accept-delivery'));
  const accepted = await assertAcceptance(root, workId, 'acceptance', subject.path, evidence.path);
  assert.equal(accepted.decisionId, 'accept-delivery');
  assert.match(accepted.requestFingerprint, /^[a-f0-9]{64}$/u);
  assert.equal((await inspectConfirmations(root, workId)).requests.length, 3);
  await assert.rejects(assertAcceptance(root, workId, 'requirements', subject.path, evidence.path), /交付验收/u);
  put(root, evidence.path, '# 新验证\n\n结果发生变化。\n');
  await assert.rejects(assertAcceptance(root, workId, 'acceptance', subject.path, evidence.path), /内容已变化/u);
});

test('technical direction cannot bypass requirements and design is never acceptance', async t => {
  const root = await setup(t);
  await assert.rejects(requestConfirmation(root, workId, request('design', 'design')), /requirements/u);
  await assert.rejects(requestConfirmation(root, workId, request('release', 'release')), /acceptance/u);
  await assert.rejects(requestConfirmation(root, workId, request('shortcut', 'design', { exception: true })), /例外必须为对象/u);
  await requestConfirmation(root, workId, request('requirements'));
  await assert.rejects(requestConfirmation(root, workId, request('design', 'design', { upstream: ['requirements'] })), /上游确认未满足/u);
  await recordDecision(root, workId, decision(root, 'requirements', 'approved'));
  await assert.rejects(requestConfirmation(root, workId, request('other-scope', 'design', { upstream: ['requirements'], scope: { repositories: ['.'], targets: ['billing'] } })), /缺少覆盖当前范围/u);
});

test('missing review, rejected, conditional and revoked decisions never pass; source identity cannot be self-declared', async t => {
  const root = await setup(t);
  await requestConfirmation(root, workId, request('requirements'));
  const withoutReview = decision(root, 'requirements', 'no-review');
  delete withoutReview.sourceReview;
  assert.equal((await recordDecision(root, workId, withoutReview)).confirmed, false);
  assert.equal((await recordDecision(root, workId, decision(root, 'requirements', 'reject', 'rejected'))).status, 'rejected');
  assert.equal((await recordDecision(root, workId, decision(root, 'requirements', 'conditional', 'conditional'))).status, 'conditional');
  assert.equal((await recordDecision(root, workId, decision(root, 'requirements', 'approve'))).confirmed, true);
  assert.equal((await recordDecision(root, workId, decision(root, 'requirements', 'revoke', 'revoked'))).status, 'invalidated');
  await assert.rejects(recordDecision(root, workId, decision(root, 'requirements', 'forged', 'approved', { sourceVerification: 'verified-source' })), /不支持的字段/u);
  const missingSource = decision(root, 'requirements', 'missing-source');
  delete missingSource.source;
  await assert.rejects(recordDecision(root, workId, missingSource), /来源必须为对象/u);
});

test('changed source, subject, upstream and saved presentation require review rather than retaining approval', async t => {
  const root = await setup(t);
  await requestConfirmation(root, workId, request('requirements'));
  const approval = decision(root, 'requirements', 'approve');
  await recordDecision(root, workId, approval);
  await requestConfirmation(root, workId, request('design', 'design', { upstream: ['requirements'] }));
  await recordDecision(root, workId, decision(root, 'design', 'design-approved'));
  put(root, approval.source.reference.path, '# changed\n\n原话不可核对。\n');
  assert.equal((await checkGate(root, workId, 'requirements')).status, 'needs-review');
  assert.equal((await checkGate(root, workId, 'design')).confirmed, false);
  put(root, subject.path, '# 改需求\n\n允许重复学号。\n');
  await assert.rejects(recordDecision(root, workId, decision(root, 'requirements', 'late-approval')), /内容已变化/u);
  // Revocation remains recordable even after edits, preserving actual history.
  await recordDecision(root, workId, decision(root, 'requirements', 'withdraw', 'revoked'));
  assert.equal((await checkGate(root, workId, 'requirements')).status, 'invalidated');
});

test('acceptance must bind both the delivered document and evidence, and preserve request snapshots', async t => {
  const root = await setup(t);
  const result = await requestConfirmation(root, workId, request('acceptance', 'acceptance'));
  await recordDecision(root, workId, decision(root, 'acceptance', 'approved'));
  await assert.rejects(assertAcceptance(root, workId, 'acceptance', subject.path, evidence.path), /同时绑定/u);
  assert.equal((await requestConfirmation(root, workId, request('acceptance', 'acceptance'))).changed, false);
  await assert.rejects(requestConfirmation(root, workId, request('acceptance', 'acceptance', { reviewSummary: '另一个内容' })), /不同内容/u);
  put(root, result.presentation, '# 伪造展示\n\n未展示原需求。\n');
  assert.equal((await checkGate(root, workId, 'acceptance')).confirmed, false);
  const registry = JSON.parse(readFileSync(join(root, directory, 'confirmations.json'), 'utf8'));
  assert.ok(registry.requests[0].files[0].snapshot);
});

test('unsafe, ignored, unregistered and symlinked evidence is rejected', async t => {
  const root = await setup(t);
  for (const path of ['../escape.md', '.git/config', '.tiller/local/source.md', 'nested/.tiller/local/source.md']) {
    await assert.rejects(requestConfirmation(root, workId, request('unsafe', 'requirements', { subjects: [file(path)] })));
  }
  await assert.rejects(requestConfirmation(root, workId, request('unknown', 'requirements', { scope: { repositories: ['unknown'], targets: ['x'] }, subjects: [{ repository: 'unknown', path: 'file.md' }] })), /未登记/u);
  gitRepository(root, '.');
  put(root, '.gitignore', readFileSync(join(root, '.gitignore'), 'utf8') + '\nsecret.md\n');
  put(root, 'secret.md', 'Sensitive test fixture');
  await assert.rejects(requestConfirmation(root, workId, request('ignored', 'requirements', { subjects: [file('secret.md')] })), /忽略/u);
  try { symlinkSync(join(root, directory), join(root, 'linked'), 'junction'); }
  catch (error) { if (error.code === 'EPERM') return; throw error; }
  await assert.rejects(requestConfirmation(root, workId, request('linked', 'requirements', { subjects: [file('linked/requirements.md')] })), /符号链接/u);
});

test('managed repository evidence uses its own Git ignore rules and explicit repository identity', async t => {
  const root = fixture(t);
  const repository = gitRepository(root, 'repository-a');
  await initialize({ root, mode: 'workspace', repositories: ['repository-a'] });
  put(root, `${directory}/work.md`, '# 组合工作\n\n审阅仓库需求。\n');
  put(repository, 'requirements.md', '# 仓库需求\n\n学生学号唯一。\n');
  const scoped = request('requirements', 'requirements', { scope: { repositories: ['repository-a'], targets: ['student-service'] }, subjects: [{ repository: 'repository-a', path: 'requirements.md' }] });
  assert.equal((await requestConfirmation(root, workId, scoped)).status, 'pending');
  put(repository, '.gitignore', 'requirements.md\n');
  assert.equal((await checkGate(root, workId, 'requirements')).status, 'needs-review');
  await assert.rejects(requestConfirmation(root, workId, request('alias', 'requirements', { subjects: [file('repository-a/requirements.md')] })), /仓库身份/u);
  await assert.rejects(requestConfirmation(root, workId, request('case-alias', 'requirements', { subjects: [file('REPOSITORY-A/requirements.md')] })), /仓库身份/u);
});

test('editorial re-review preserves original decision and snapshots, while source changes or revocation invalidate reuse', async t => {
  const root = await setup(t);
  await requestConfirmation(root, workId, request('original'));
  const original = decision(root, 'original', 'original-approval', 'approved', { decidedAt: '2026-10-15T00:00:00.000Z' });
  await recordDecision(root, workId, original);
  const previous = JSON.parse(readFileSync(join(root, directory, 'confirmations.json'), 'utf8'));
  const savedSnapshot = readFileSync(join(root, previous.requests[0].files[0].snapshot), 'utf8');
  put(root, subject.path, '# 需求\n\n学号唯一，删除不存在的学生返回 false。\n\n');
  await requestConfirmation(root, workId, request('editorial'));
  const reuse = {
    ...original, requestId: 'editorial', decisionId: 'editorial-review',
    source: { ...original.source, presentation: file(`${directory}/reviews/request-editorial/presentation.md`) },
    sourceReview: { ...original.sourceReview, rationale: '对比原快照与新正文，仅增加空行；语义由执行者实际复核，程序不能判断。' },
    reuseOf: { requestId: 'original', decisionId: 'original-approval', reason: '仅增加末尾空行，范围和行为未变。' },
  };
  assert.equal((await recordDecision(root, workId, reuse)).confirmed, true);
  assert.equal(readFileSync(join(root, previous.requests[0].files[0].snapshot), 'utf8'), savedSnapshot);
  await assert.rejects(recordDecision(root, workId, { ...reuse, decisionId: 'invented-time', decidedAt: '2026-10-16T00:00:00.000Z' }), /决定时间/u);
  await recordDecision(root, workId, decision(root, 'original', 'withdraw-original', 'revoked'));
  assert.equal((await checkGate(root, workId, 'editorial')).confirmed, false);
  await assert.rejects(recordDecision(root, workId, { ...reuse, decisionId: 'reuse-revoked' }), /撤销/u);
});

test('explicit exception requires source, review and exactly scoped action instead of a self-exemption flag', async t => {
  const root = await setup(t);
  const reference = file(`${directory}/exception-source.md`);
  const displayed = file(`${directory}/exception-proposal.md`);
  put(root, reference.path, '测试用户允许本学生服务在需求确认前起草候选设计，完成此候选设计后终止。');
  put(root, displayed.path, '# 例外范围\n\n仅学生服务候选设计，需求和设计仍分别保存。');
  const exception = {
    reason: '用户明确允许提前起草候选设计。', allowedAction: '继续当前交付', endCondition: '本候选设计草稿完成即终止。',
    source: { kind: 'conversation', reference, quote: '允许本学生服务在需求确认前起草候选设计', presentation: displayed },
    sourceReview: { reviewer: '测试执行者', rationale: '已核对指定学生服务范围和提前起草的明确例外；不扩展到编码。', reviewedAt: '2026-10-15T00:00:00.000Z' },
  };
  assert.equal((await requestConfirmation(root, workId, request('candidate', 'design', { exception }))).status, 'pending');
  await assert.rejects(requestConfirmation(root, workId, request('wrong-action', 'design', { exception: { ...exception, allowedAction: '发布全部服务' } })), /下一步完全对应/u);
  put(root, reference.path, '原例外来源已变化。');
  assert.equal((await checkGate(root, workId, 'candidate')).status, 'needs-review');
});
