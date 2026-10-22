import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { suggestedBranchName } from './branch-conventions.js';
import { readCaseLibrary } from './cases.js';
import { commitTypeForTaskType, taskCommits, type CommitType, type TaskCommit } from './commit-conventions.js';
import { inspectFlow, readTask } from './flow.js';
import type { FlowTask } from './flow.js';

const TASK_HEADINGS = ['关联任务', '变更内容', '验收条件', '验证结果', '影响与风险'] as const;
const IMPACT_PLACEHOLDER = '待补充：任务设计未单列“影响与风险”，请人工补充。';

export interface PullRequestDraft {
  id: string;
  title: string;
  body: string;
  type: CommitType;
  module: string | null;
  branch: string;
  commits: TaskCommit[];
  warnings: string[];
}

function sectionBody(content: string, title: string, level: 2 | 3): string {
  const marker = level === 2 ? '##' : '###';
  const match = new RegExp(`^${marker} ${title}\\s*$`, 'mu').exec(content);
  if (!match) return '';
  const rest = content.slice(match.index + match[0].length);
  const next = new RegExp(`^#{1,${level}}\\s+`, 'mu').exec(rest);
  return rest.slice(0, next?.index ?? rest.length).trim();
}

async function specModules(root: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(root, '.tiller/specs/modules'), { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch {
    return [];
  }
}

function referencedModules(task: FlowTask, available: string[]): string[] {
  const text = `${task.requirement}\n${task.design}\n${task.meta.scope.join('\n')}`;
  const found = new Set<string>();
  for (const match of text.matchAll(/\.tiller\/(?:specs|cases)\/modules\/([a-z][a-z0-9_-]*)/gu)) {
    if (available.includes(match[1]!)) found.add(match[1]!);
  }
  return [...found].sort();
}

function scopeCovers(scope: string[], relative: string): boolean {
  return scope.some(value => value === '.' || relative === value || relative.startsWith(`${value}/`));
}

function latestVerification(task: FlowTask, criterion: string) {
  return [...task.verifications].reverse().find(item => item.criterion === criterion);
}

function impactText(task: FlowTask): string {
  if (!task.design.trim()) return '无';
  const impact = sectionBody(task.design, '影响与风险', 3) || sectionBody(task.design, '影响与风险', 2);
  return impact || IMPACT_PLACEHOLDER;
}

function bodyMarkdown(task: FlowTask, commits: TaskCommit[], covered: Map<string, boolean>): string {
  const sections = new Map<string, string[]>();
  sections.set('关联任务', [`[${task.meta.id}](.tiller/task/${task.meta.id}/task.md)`]);
  sections.set('变更内容', commits.length ? commits.map(commit => `- ${commit.subject}`) : ['- （待补充：任务基线后尚无提交）']);
  sections.set('验收条件', task.criteria.map(criterion => `- [${covered.get(criterion.id) ? 'x' : ' '}] ${criterion.id}: ${criterion.text}`));
  sections.set('验证结果', task.criteria.map(criterion => {
    const run = latestVerification(task, criterion.id);
    if (!run) return `- ${criterion.id}：尚无验证记录。`;
    const cases = run.cases.length ? `；用例 ${run.cases.join(', ')}` : '';
    const state = covered.get(criterion.id) ? '当前有效' : '当前未覆盖或已过期';
    return `- ${criterion.id}：${run.result}（${state}）；测试 \`${run.test}\`${cases}；命令 \`${run.command}\`；提交 \`${run.commit}\`。`;
  }));
  sections.set('影响与风险', [impactText(task)]);
  return TASK_HEADINGS.flatMap(heading => [`## ${heading}`, '', ...sections.get(heading)!, '']).join('\n').trimEnd();
}

export async function draftPullRequest(rootInput: string, id: string): Promise<PullRequestDraft & { markdown: string }> {
  const root = path.resolve(rootInput);
  const task = await readTask(root, id);
  const type = commitTypeForTaskType(task.meta.type);
  if (!type) throw Object.assign(new Error(`无法从任务类型 ${task.meta.type} 推导提交类型。`), { code: 'PR_TYPE_UNKNOWN' });
  const checked = await inspectFlow(root, id);
  const available = await specModules(root);
  const modules = new Set(referencedModules(task, available));
  const library = await readCaseLibrary(root);
  for (const item of library.cases) {
    if (item.source.some(source => scopeCovers(task.meta.scope, source))) {
      for (const module of item.modules) if (available.includes(module)) modules.add(module);
    }
  }
  const resolvedModules = [...modules].sort();
  const module = resolvedModules.length === 1 ? resolvedModules[0]! : null;
  const warnings: string[] = [];
  if (resolvedModules.length > 1) warnings.push(`任务涉及多个模块（${resolvedModules.join(', ')}），PR 标题已省略模块，请人工确认。`);
  const title = `${type}${module ? `(${module})` : ''}: ${task.title} [${task.meta.id}]`;
  const branch = suggestedBranchName(type, task.meta.id);
  const commits = await taskCommits(root, task.meta.base);
  if (commits.warning) warnings.push(commits.warning);
  const covered = new Map(checked.criteria.map(item => [item.id, item.covered]));
  const body = bodyMarkdown(task, commits.commits, covered);
  return {
    id: task.meta.id, title, body, type, module, branch,
    commits: commits.commits, warnings, markdown: `${title}\n\n建议分支：\`${branch}\`\n\n${body}\n`,
  };
}
