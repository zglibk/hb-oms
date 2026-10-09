import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DIMENSION_UNIT, INCH_TO_MM } from '@hb-oms/shared';
import { SystemConfig } from './entities/system-config.entity';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { normalizeUploadUrl } from '../../common/utils/upload-url.util';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnUpdate } from '../../common/utils/audit.util';

const UPLOAD_URL_FIELDS = ['logoUrl', 'faviconUrl', 'loginBgUrl'] as const;

/**
 * 系统配置服务（单行表，id 固定为 1）
 */
@Injectable()
export class SystemConfigService {
  constructor(
    @InjectRepository(SystemConfig)
    private readonly repo: Repository<SystemConfig>,
    private readonly dataSource: DataSource,
  ) {}

  private normalizeUploadFields<T extends SystemConfig | UpdateSystemConfigDto>(data: T): T {
    const target = data as Record<string, string | null | undefined>;
    for (const field of UPLOAD_URL_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(target, field)) {
        target[field] = normalizeUploadUrl(target[field]);
      }
    }
    return data;
  }

  /** 获取单行配置；不存在时自动创建空行 */
  async get(): Promise<SystemConfig> {
    let row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) {
      row = this.repo.create({
        id: 1,
        loginBgSetAsDefault: 0,
        colorFieldEnabled: 1,
        customerDrawingNoEnabled: 1,
        dullStockColorEnabled: 1,
        productRequirementEnabled: 1,
      });
      row = await this.repo.save(row);
    }
    return this.normalizeUploadFields(row);
  }

  /**
   * 业务字段开关（仅需登录即可读，供各业务页与服务端导出决定字段显隐）。
   *
   * 与 getPublic() 分成两个接口而不是并进去：那个是**登录页免登**读的品牌信息
   * （logo/favicon/公司名/背景），语义上属于"未登录也能看的门面"；业务字段开关
   * 只有登录后的业务页要用，混在一起会让两边的口径都说不清。
   *
   * ⚠️ 服务端只用它决定**导出列**是否输出该字段（导出文件由服务端生成，前端隐藏不了），
   * **刻意不在写入侧剥离字段值**：停用只是"不再录入/展示"，若写入侧强行置空，
   * 用户在停用期间编辑一张老订单（订单更新是整体重建）就会把历史值永久洗掉。
   * 停用期间前端不显示输入框但仍原样回传既有值，重新启用后数据完好。
   *
   * 新增开关照此加一个布尔即可（同时补 entity 列 + DTO + 迁移，见 CLAUDE.md §5.7）。
   */
  async getFeatureFlags(): Promise<{
    colorFieldEnabled: boolean;
    customerDrawingNoEnabled: boolean;
    dullStockColorEnabled: boolean;
    productRequirementEnabled: boolean;
    inchToMm: number;
    dimensionViewUnit: 'mm' | 'inch';
    deliveryTemplateDefault: string;
  }> {
    const row = await this.get();
    // 系数落库前已被 DTO 校验，但旧行/脏数据可能是 0 或 NULL，这里兜一次缺省值：
    // 除零会让整页规格显示成 Infinity，比"用了默认值"严重得多
    const inchToMm = Number(row.inchToMm);
    return {
      colorFieldEnabled: Number(row.colorFieldEnabled) === 1,
      customerDrawingNoEnabled: Number(row.customerDrawingNoEnabled) === 1,
      // 呆滞品颜色独立开关，不与 colorFieldEnabled 相与——两者各管各的（见实体注释）
      dullStockColorEnabled: Number(row.dullStockColorEnabled) === 1,
      productRequirementEnabled: Number(row.productRequirementEnabled) === 1,
      inchToMm: Number.isFinite(inchToMm) && inchToMm > 0 ? inchToMm : INCH_TO_MM,
      dimensionViewUnit: row.dimensionViewUnit === DIMENSION_UNIT.INCH ? 'inch' : 'mm',
      // 送货单默认模板：空/NULL 回落通用模板（版式在前端注册表，此处不校验值域）
      deliveryTemplateDefault: String(row.deliveryTemplateDefault ?? '').trim() || 'generic',
    };
  }

  /**
   * 某模块的修改主管角色编码：该模块的记录只允许创建人与这些角色的用户修改（管理员与超级管理员均不例外）。
   * 空串 = 只有创建人能改。判定逻辑在 RecordOwnershipService，这里只负责取配置。
   */
  async getEditRoles(module: 'order' | 'outsource' | 'assembly' | 'finished'): Promise<string[]> {
    const row = await this.get();
    const raw = {
      order: row.orderEditRoles,
      outsource: row.outsourceEditRoles,
      assembly: row.assemblyEditRoles,
      finished: row.finishedEditRoles,
    }[module];
    return String(raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // ===== 数据大屏免登录访问码 =====
  // 库里只存 SHA-256 摘要，明文只在生成当次回给管理员一次（之后谁也看不到，丢了就重置）。
  // 访问码是 32 字节随机数（base64url 43 位），暴力猜测不可行，故公开接口无需另加限流。

  private hashScreenKey(key: string): string {
    return createHash('sha256').update(key, 'utf8').digest('hex');
  }

  private async loadScreenKeyHash(): Promise<string | null> {
    await this.get(); // 确保单行存在
    const row = await this.repo
      .createQueryBuilder('c')
      .addSelect('c.screenKeyHash')
      .where('c.id = 1')
      .getOne();
    return row?.screenKeyHash ?? null;
  }

  /** 免登录访问是否开启（配置页展示状态用，不回摘要） */
  async getScreenKeyStatus(): Promise<{ enabled: boolean }> {
    return { enabled: !!(await this.loadScreenKeyHash()) };
  }

  /** 生成 / 重置访问码：旧访问码立即失效；明文只在本次返回 */
  async regenerateScreenKey(user: CurrentUserPayload): Promise<{ key: string }> {
    await this.get();
    const key = randomBytes(32).toString('base64url');
    const audit = auditOnUpdate(user);
    await this.repo.update(1, {
      screenKeyHash: this.hashScreenKey(key),
      updatedBy: audit.updaterId,
      updaterName: audit.updaterName,
    });
    return { key };
  }

  /** 关闭免登录访问（清空摘要，现有电视立即失效） */
  async disableScreenKey(user: CurrentUserPayload): Promise<void> {
    await this.get();
    const audit = auditOnUpdate(user);
    await this.repo.update(1, {
      screenKeyHash: null,
      updatedBy: audit.updaterId,
      updaterName: audit.updaterName,
    });
  }

  /** 校验访问码：未开启或不匹配均返回 false；摘要定长比较，防按耗时逐位试探 */
  async verifyScreenKey(key: string | undefined | null): Promise<boolean> {
    if (!key) return false;
    const stored = await this.loadScreenKeyHash();
    if (!stored) return false;
    const a = Buffer.from(this.hashScreenKey(key), 'hex');
    const b = Buffer.from(stored, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** 更新配置（传入的字段覆盖现有值） */
  async update(
    dto: UpdateSystemConfigDto,
    user: CurrentUserPayload,
  ): Promise<SystemConfig> {
    const row = await this.get();
    const audit = auditOnUpdate(user);
    Object.assign(row, this.normalizeUploadFields({ ...dto }), {
      updatedBy: audit.updaterId,
      updaterName: audit.updaterName,
    });
    const saved = await this.repo.save(row);
    return this.normalizeUploadFields(saved);
  }

  /**
   * 公开接口返回（脱敏：不含银行账号/税号/联系电话/公司地址等敏感字段）
   * 仅返回登录页免登读取所需的 logo + favicon + 公司名/系统名/版权 + 默认背景
   */
  async getPublic() {
    const row = await this.get();
    return {
      logoUrl: row.logoUrl,
      faviconUrl: row.faviconUrl,
      companyName: row.companyName,
      systemName: row.systemName,
      copyrightInfo: row.copyrightInfo,
      loginBgUrl: row.loginBgUrl,
      loginBgSetAsDefault: row.loginBgSetAsDefault,
    };
  }

  /**
   * 渲染供社交分享爬虫抓取的 HTML（含实时系统配置的 og / twitter meta）
   *
   * 用途：Nginx 检测到分享爬虫 UA（微信/QQ/微博等）时，将请求转发到此端点，
   * 返回带有当前系统名/Logo/描述的最小 HTML，使分享卡片实时反映后台配置，
   * 管理员在「系统配置」中修改后立即生效，无需改动服务器配置。
   *
   * @param origin  请求来源（如 http://120.79.138.198），用于拼接 og:image 绝对地址
   */
  async renderShareHtml(origin: string): Promise<string> {
    const row = await this.get();
    const system = (row.systemName || '海宝五金订单跟踪系统').trim();
    const company = (row.companyName || '海宝五金').trim();
    const title =
      company && !system.includes(company) ? `${company} · ${system}` : system;
    const description = `${company}订单跟踪系统 —— 订单 → 外发 → 装配 → 出入库全链路跟踪台账，实时掌握订单数、完成数、库存数与欠数。`;

    // og:image 需为可公网访问的绝对地址；优先 logo，回退 favicon，再回退站点默认图标
    const rawImg = row.logoUrl || row.faviconUrl || '/favicon.svg';
    const image = rawImg.startsWith('http')
      ? rawImg
      : `${origin}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`;

    // HTML 转义，避免配置中的特殊字符破坏标签
    const esc = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const t = esc(title);
    const d = esc(description);
    const s = esc(system);
    const img = esc(image);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>${t}</title>
<meta name="description" content="${d}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${s}" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:image" content="${img}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${img}" />
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
</body>
</html>`;
  }

  // ===================== 危险操作：业务数据清理 =====================

  /**
   * 清理业务测试数据（订单/排产/外协/消息/日志/文件/单号序列），
   * 保留系统配置（用户/角色/权限/菜单/部门）、物料主数据、字典主数据。
   *
   * 技术性安全判断：订单数 > 50 视为已正式使用，拒绝清理。
   * 即使超级管理员也无法清理，避免误删生产数据。
   *
   * @param user  执行清理的操作人（用于审计日志）
   * @param confirm  二次确认口令，必须为 "清理" 二字
   */
  async cleanupBusinessData(
    user: { id: number; username: string; realName: string },
    confirm: string,
  ): Promise<{ truncated: string[]; orderCount: number }> {
    // 1. 二次确认口令校验
    if (confirm !== '清理') {
      throw new BadRequestException('请输入正确的确认口令「清理」');
    }

    // 2. 技术性安全判断：订单数 > 50 视为已正式使用，拒绝清理
    const orderCount: number = await this.dataSource.query(
      'SELECT COUNT(*) AS cnt FROM t_order',
    ).then((rows: any[]) => Number(rows[0]?.cnt ?? 0));

    if (orderCount > 50) {
      throw new BadRequestException(
        `检测到 ${orderCount} 条订单数据，系统疑似已正式投入使用，为安全起见禁止清理。如确需清理，请直接在数据库手动执行 scripts/ops/cleanup-business-data.sql。`,
      );
    }

    // 3. 按依赖反向顺序清空 OMS 业务表（保留主数据与系统配置）。
    //    顺序＝从下游到上游：成品余额/明细/单头 → 装配 → 外发 → 订单四级 → 日志/文件/采番。
    const truncated = [
      't_finished_balance',
      't_finished_item',
      't_finished_doc',
      't_assembly_batch',
      't_outsource_part',
      't_part_adjust',
      't_part_balance',
      't_order_part',
      't_order_part_group',
      't_order_product',
      't_order',
      't_operation_log',
      't_file',
      't_no_sequence',
    ];

    // 改用可回滚的 DELETE + 显式事务（安全审查 P1）：
    //   MySQL 的 TRUNCATE 是 DDL，会「隐式提交」并终止当前事务，此前用
    //   dataSource.transaction 包裹 TRUNCATE 属于虚假保护——中途失败无法回滚，
    //   且异常路径下连接可能带着 FOREIGN_KEY_CHECKS=0 归还连接池，污染后续请求。
    // 现方案：
    //   1. 独占一个 QueryRunner，会话级变量的作用域与回滚范围均可控；
    //   2. DELETE 可参与事务，任一表失败则整体回滚；
    //   3. finally 中无条件恢复 FOREIGN_KEY_CHECKS 并释放连接；
    //   4. 不重置代理主键自增值，避免在提交后执行无法回滚的 ALTER TABLE。
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query('SET FOREIGN_KEY_CHECKS = 0');
      await runner.startTransaction();
      try {
        for (const table of truncated) {
          await runner.query(`DELETE FROM ${table}`);
        }
        await runner.commitTransaction();
      } catch (e) {
        await runner.rollbackTransaction();
        throw e;
      }
    } finally {
      // 无论成功失败，必须恢复外键检查后再归还连接，防止污染连接池
      try {
        await runner.query('SET FOREIGN_KEY_CHECKS = 1');
      } finally {
        await runner.release();
      }
    }

    return { truncated, orderCount };
  }
}
