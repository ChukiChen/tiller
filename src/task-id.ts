export function validateTaskId(id: string): void {
  if (typeof id !== 'string' || !/^(?:[0-9]{8}-)?[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || id.length > 64
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:-|$)/i.test(id)) {
    throw Object.assign(new Error('任务标识须为 1–64 位小写字母、数字和单个连字符，以字母或 YYYYMMDD-日期前缀开头，不得使用设备保留名。'), {
      code: 'INVALID_TASK_ID',
    });
  }
}

/** Date prefixes stay a recommendation so existing task and plan ids remain readable. */
export function taskIdWarnings(id: string): string[] {
  validateTaskId(id);
  if (/^[0-9]{8}-/u.test(id)) return [];
  return [`任务编号 ${id} 缺少 YYYYMMDD- 日期前缀；建议使用 YYYYMMDD-${id}。为兼容历史记录，未自动改写。`];
}
