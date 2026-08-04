import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import dayjs from 'dayjs';

/**
 * 单号采番服务（无 Redis 方案，文档 20.4）。
 * 通过 MySQL 计数表 + LAST_INSERT_ID 原子自增生成每日序号，
 * 配合业务表 order_no/plan_no/subcontract_no 唯一索引兜底防重复。
 *   格式：PREFIXyymmdd-XXXX（XXXX 当日从 0001 起）
 */
@Injectable()
export class NumberGeneratorService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 生成单号。可传入事务 manager 以保证与业务写入在同一事务。
   * @param prefix 前缀，如 ORD / PLN / SC / FGI / SCT / FILE
   */
  async generate(prefix: string, manager?: EntityManager): Promise<string> {
    const today = dayjs().format('YYMMDD');
    const key = `${prefix}:${today}`;
    const seq = await this.generateSequence(key, manager);
    return `${prefix}${today}-${String(seq).padStart(4, '0')}`;
  }

  /**
   * 生成不按日期重置的定长文本序号，数据库仅保存补零后的数字部分。
   * 展示前缀由业务层按需拼接，例如发坯单号的 `No.`。
   */
  async generatePaddedSequence(
    key: string,
    width: number,
    manager?: EntityManager,
  ): Promise<string> {
    const seq = await this.generateSequence(key, manager);
    const max = 10 ** width - 1;
    if (seq > max) {
      throw new Error(`序号已超过 ${width} 位上限（key=${key}）`);
    }
    return String(seq).padStart(width, '0');
  }

  private async generateSequence(
    key: string,
    manager?: EntityManager,
  ): Promise<number> {
    return manager
      ? this.nextSeq(manager, key) // 事务内：与业务写入同连接、同事务
      : this.nextSeqOnDedicatedConnection(key); // 非事务：独占一个连接
  }

  /**
   * 原子自增并取回序号。
   *
   * 安全审查 P2：LAST_INSERT_ID() 是**连接级**会话状态。旧实现先执行 INSERT，
   * 再另发一条 `SELECT LAST_INSERT_ID()`——在未传事务 manager 时（如文件上传），
   * 两条语句可能由连接池分配到不同连接，读到的会是**其他请求**的序号，
   * 导致单号重复或跳号。
   *
   * 现方案：直接读取 INSERT 语句自身返回的 insertId（driver 在同一次交互中带回，
   * 不存在跨连接问题），彻底去掉第二条 SELECT。
   */
  private async nextSeq(runner: EntityManager, key: string): Promise<number> {
    const result = await runner.query(
      `INSERT INTO t_no_sequence (seq_key, seq_val) VALUES (?, LAST_INSERT_ID(1))
       ON DUPLICATE KEY UPDATE seq_val = LAST_INSERT_ID(seq_val + 1)`,
      [key],
    );
    // mysql2 返回 ResultSetHeader，insertId 即本次 LAST_INSERT_ID 的值
    const seq = Number(result?.insertId ?? 0);
    if (!seq) {
      throw new Error(`单号采番失败：未取得序号（key=${key}）`);
    }
    return seq;
  }

  /**
   * 非事务调用路径：显式借出一个 QueryRunner 并在其上完成采番，
   * 保证语句落在同一物理连接上（即便未来需要回退到两段式写法也是安全的）。
   */
  private async nextSeqOnDedicatedConnection(key: string): Promise<number> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      return await this.nextSeq(runner.manager, key);
    } finally {
      await runner.release();
    }
  }
}
