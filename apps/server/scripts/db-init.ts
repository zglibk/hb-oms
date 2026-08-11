/**
 * 数据库初始化脚本
 *   pnpm db:init
 * 执行内容：
 *   1. 连接 MySQL（不指定库），创建数据库 haibao_oms（若不存在）
 *   2. 执行 01-schema.sql 建表
 *   3. 写入种子数据：部门 / 角色 / 权限 / 字典 / 账号 / 角色-权限绑定
 * 幂等：重复执行不会重复插入（按唯一键判断）
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import * as mysql from 'mysql2/promise';
import * as bcrypt from 'bcryptjs';
import {
  DEPARTMENTS,
  POSITIONS,
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  DICTS,
  USERS,
  
} from './seed-data';

config({ path: resolve(__dirname, '..', '.env') });

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'haibao_oms',
} = process.env;

async function main() {
  // 1. 建库
  const root = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`,
  );
  console.log(`✓ 数据库 ${DB_NAME} 就绪`);
  await root.end();

  // 2. 连接目标库并建表
  const db = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
    charset: 'utf8mb4',
  });

  const schemaSql = readFileSync(resolve(__dirname, 'sql', '01-schema.sql'), 'utf-8');
  await db.query(schemaSql);
  console.log('✓ 建表完成 (01-schema.sql)');

  // 3. 种子数据
  await seedDepartments(db);
  await seedPositions(db);
  await seedRoles(db);
  await seedPermissions(db);
  await seedRolePermissions(db);
  await seedDicts(db);
  await seedUsers(db);

  await db.end();
  console.log('\n🎉 数据库初始化完成');
  console.log('   默认账号：admin / Admin@123（系统管理员）');
  console.log('   其他账号：sales01/follow01（Sale@123）、wh01（Wh@12345）');
}

async function seedDepartments(db: mysql.Connection) {
  for (const d of DEPARTMENTS) {
    await db.query(
      // hr_code 必须一并种下：它是员工编号第 5-7 位的来源，缺了就没法给员工建档
      `INSERT INTO t_department (dept_code, dept_name, hr_code, parent_id, sort)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE dept_name = VALUES(dept_name), hr_code = VALUES(hr_code),
         parent_id = VALUES(parent_id), sort = VALUES(sort)`,
      [d.dept_code, d.dept_name, d.hr_code, d.parent_id, d.sort],
    );
  }
  console.log(`✓ 部门 ${DEPARTMENTS.length} 条`);
}

/** 岗位主数据：员工建档的岗位下拉取自这里，新库必须种，否则下拉是空的 */
async function seedPositions(db: mysql.Connection) {
  for (const p of POSITIONS) {
    await db.query(
      `INSERT INTO t_position (position_code, position_name, sort, status, creator_name, updater_name)
       VALUES (?, ?, ?, 1, '系统同步', '系统同步')
       ON DUPLICATE KEY UPDATE position_name = VALUES(position_name), sort = VALUES(sort)`,
      [p.position_code, p.position_name, p.sort],
    );
  }
  console.log(`✓ 岗位 ${POSITIONS.length} 条`);
}

async function seedRoles(db: mysql.Connection) {
  for (const r of ROLES) {
    await db.query(
      `INSERT INTO t_role (role_code, role_name, data_scope, is_builtin, status, sort, remark)
       VALUES (?, ?, ?, 1, 1, ?, ?)
       ON DUPLICATE KEY UPDATE role_name = VALUES(role_name), data_scope = VALUES(data_scope), sort = VALUES(sort), remark = VALUES(remark)`,
      [r.role_code, r.role_name, r.data_scope, r.sort, r.remark],
    );
  }
  console.log(`✓ 角色 ${ROLES.length} 条`);
}

async function seedPermissions(db: mysql.Connection) {
  // 两遍：先插入获取 id 映射，再回填 parent_id
  const codeToId = new Map<string, number>();
  for (const p of PERMISSIONS) {
    await db.query(
      `INSERT INTO t_permission (perm_code, perm_name, perm_type, parent_id, menu_path, component, icon, sort)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE perm_name = VALUES(perm_name), perm_type = VALUES(perm_type),
         menu_path = VALUES(menu_path), component = VALUES(component), icon = VALUES(icon), sort = VALUES(sort)`,
      [p.perm_code, p.perm_name, p.perm_type, p.menu_path ?? null, p.component ?? null, p.icon ?? null, p.sort],
    );
    const [rows]: any = await db.query('SELECT id FROM t_permission WHERE perm_code = ?', [p.perm_code]);
    codeToId.set(p.perm_code, rows[0].id);
  }
  // 回填 parent_id
  for (const p of PERMISSIONS) {
    if (p.parent_code) {
      const pid = codeToId.get(p.parent_code) ?? 0;
      await db.query('UPDATE t_permission SET parent_id = ? WHERE perm_code = ?', [pid, p.perm_code]);
    }
  }
  console.log(`✓ 权限 ${PERMISSIONS.length} 条`);
}

async function seedRolePermissions(db: mysql.Connection) {
  // 角色 id 映射
  const [roleRows]: any = await db.query('SELECT id, role_code FROM t_role');
  const roleId = new Map<string, number>(roleRows.map((r: any) => [r.role_code, r.id]));
  // 权限 id 映射
  const [permRows]: any = await db.query('SELECT id, perm_code FROM t_permission');
  const permId = new Map<string, number>(permRows.map((p: any) => [p.perm_code, p.id]));
  const allPermIds = permRows.map((p: any) => p.id);

  for (const [roleCode, rid] of roleId) {
    // admin 绑定全部权限
    const permIds =
      roleCode === 'admin'
        ? allPermIds
        : (ROLE_PERMISSIONS[roleCode] ?? []).map((c) => permId.get(c)).filter((x): x is number => !!x);

    for (const pid of permIds) {
      await db.query(
        `INSERT INTO t_role_permission (role_id, permission_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE role_id = role_id`,
        [rid, pid],
      );
    }
  }
  console.log('✓ 角色-权限绑定完成');
}

async function seedDicts(db: mysql.Connection) {
  for (const d of DICTS) {
    const [exist]: any = await db.query(
      'SELECT id FROM t_dict WHERE dict_type = ? AND dict_value = ?',
      [d.dict_type, d.dict_value],
    );
    if (exist.length === 0) {
      await db.query(
        'INSERT INTO t_dict (dict_type, dict_label, dict_value, sort, parent_value) VALUES (?, ?, ?, ?, ?)',
        [
          d.dict_type,
          d.dict_label,
          d.dict_value,
          d.sort,
          d.parent_value ?? null,
        ],
      );
    }
  }
  console.log(`✓ 字典 ${DICTS.length} 条`);
}

async function seedUsers(db: mysql.Connection) {
  const [deptRows]: any = await db.query('SELECT id, dept_code FROM t_department');
  const deptId = new Map<string, number>(deptRows.map((d: any) => [d.dept_code, d.id]));
  const [roleRows]: any = await db.query('SELECT id, role_code FROM t_role');
  const roleId = new Map<string, number>(roleRows.map((r: any) => [r.role_code, r.id]));

  for (const u of USERS) {
    const hash = await bcrypt.hash(u.plainPwd, 12);
    await db.query(
      `INSERT INTO t_user (username, password, real_name, dept_id, status)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE real_name = VALUES(real_name), dept_id = VALUES(dept_id)`,
      [u.username, hash, u.real_name, deptId.get(u.dept_code) ?? null],
    );
    const [userRows]: any = await db.query('SELECT id FROM t_user WHERE username = ?', [u.username]);
    const uid = userRows[0].id;
    for (const rc of u.roles) {
      const rid = roleId.get(rc);
      if (rid) {
        await db.query(
          `INSERT INTO t_user_role (user_id, role_id) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE user_id = user_id`,
          [uid, rid],
        );
      }
    }
  }
  console.log(`✓ 账号 ${USERS.length} 个`);
}

main().catch((err) => {
  console.error('✗ 初始化失败：', err);
  process.exit(1);
});
