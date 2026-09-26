/**
 * 订单「产品代码」（字段 item_no，原名「货号」）的写法规则——前后端唯一事实源（2026-09-25）。
 *
 * 产品代码只能是**宽度**（如 45#）或**代码式内容**（客户料号 / 编码，如 DS3832A-22Z-DM、
 * 494.02.063、E2304/350、TT100B 400(A)）：字母、数字、半角空格与代码常用符号 # - . / _ ( ) + *。
 * **不允许中文与全角字符**——「45#无锁力」「45#-滚珠滑轨芯（无夹力） -P001255」这类说明文字
 * 应写到「产品名称」，否则入库单等纸面的「产品代码」栏印出一长串说明（使用方实测提出）。
 *
 * 允许半角空格：真实客户料号里有「TT100B 400(A)」「IMEX FULLSOFT12」这种带空格的代码。
 * 规则按 2026-09-25 的 229 种存量写法校准：拦下的 24 种全是「宽度+中文说明」或「客户品名+料号」。
 */
export const ITEM_CODE_PATTERN = /^[A-Za-z0-9#\-._/()+* ]+$/;

/** 前端表单与服务端 DTO 共用的提示文案 */
export const ITEM_CODE_MESSAGE =
  '产品代码只能填写宽度（如 45#）或代码（字母、数字及 # - . / 等符号），「无锁力」「滚珠滑轨芯」等说明文字请填写到产品名称中';

/** 录入时当场清除中文后的提示（订单表单） */
export const ITEM_CODE_STRIP_MESSAGE = '产品代码不能含中文，已自动去除；「无锁力」「滚珠滑轨芯」等说明文字请填写到产品名称中';

/**
 * 去掉产品代码里的非代码字符（中文、全角符号等），只留代码部分（2026-09-25 使用方要求）。
 *
 * 两处用法：
 *   - 订单表单录入时当场清除（配合 ITEM_CODE_STRIP_MESSAGE 提示）；
 *   - 入库单 / 送货单 / 页面 / Excel 导出**显示**历史数据时清洗——库里存量值（如「45#无锁力」）
 *     不回写（快照原则），只是印出来只剩代码：
 *       「45#无锁力」→「45#」、「45#-普通滚珠滑轨芯（无夹力）  -P001255」→「45#-P001255」、
 *       「6000-16BULK.2UT-内」→「6000-16BULK.2UT」、「45# 普通」→「45#」。
 * 全角「＃」先换成半角再清洗（它是井号的误输入，不是说明文字）。
 * 清掉中文后会留下空括号「()」（原「(右)」）、「-」两侧空格、连续「-」、首尾的「-」，一并收拾干净；
 * 本身合法的代码（含「TT100B 400(A)」这类带空格括号的）原样返回、不做任何收拾。
 */
export function sanitizeItemCode(v: string | null | undefined): string {
  const raw = (v ?? '').replace(/＃/g, '#');
  if (ITEM_CODE_PATTERN.test(raw.trim()) || !raw.trim()) return raw.trim();
  return raw
    .replace(/[^A-Za-z0-9#\-._/()+* ]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .trim();
}

/**
 * 录入过程中的逐字清除：只删非代码字符（中文、全角符号等），**不收拾「-」与空格**——
 * 用户正打到「45#-」时把尾部的「-」删掉会让人根本打不下去。收拾留给失焦时的 sanitizeItemCode。
 */
export function stripItemCodeInput(v: string | null | undefined): string {
  return (v ?? '').replace(/＃/g, '#').replace(/[^A-Za-z0-9#\-._/()+* ]/g, '');
}

/** 空值视为合法（产品代码本身选填）；非空时按 ITEM_CODE_PATTERN 校验（首尾空白不计） */
export function isValidItemCode(v: string | null | undefined): boolean {
  const t = (v ?? '').trim();
  return !t || ITEM_CODE_PATTERN.test(t);
}
