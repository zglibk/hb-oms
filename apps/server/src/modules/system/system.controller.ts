import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UserService } from './services/user.service';
import { RoleService } from './services/role.service';
import { MenuService } from './services/menu.service';
import { DictService } from './services/dict.service';
import { DeptService } from './services/dept.service';
import { LogService } from './services/log.service';
import { MaterialService } from './services/material.service';
import {
  CreateMaterialDto,
  UpdateMaterialDto,
  QueryMaterialDto,
} from './dto/material.dto';
import {
  AssignRolesDto,
  CreateUserDto,
  QueryUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';
import { AssignPermsDto, CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
} from './dto/permission.dto';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

/** 将逗号分隔的 id 字符串（如 "1,2,3"）解析为 number[]；为空或无有效值时返回 undefined */
function parseIdsQuery(s?: string): number[] | undefined {
  if (!s) return undefined;
  const ids = s
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? ids : undefined;
}

@Controller('system')
export class SystemController {
  constructor(
    private readonly userService: UserService,
    private readonly roleService: RoleService,
    private readonly menuService: MenuService,
    private readonly dictService: DictService,
    private readonly deptService: DeptService,
    private readonly logService: LogService,
    private readonly materialService: MaterialService,
  ) {}

  // ===== 用户 =====
  @Get('user')
  @RequirePermissions('system:user')
  userList(@Query() query: QueryUserDto, @CurrentUser() user: CurrentUserPayload) {
    return this.userService.findList(query, user);
  }

  @Get('user/:id')
  @RequirePermissions('system:user')
  userDetail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.userService.findOne(id, user);
  }

  @Post('user')
  @RequirePermissions('user:create')
  @OperationLog('系统管理', '新增用户')
  createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.userService.create(dto, user);
  }

  @Put('user/:id')
  @RequirePermissions('user:update')
  @OperationLog('系统管理', '修改用户')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.userService.update(id, dto, user);
  }

  @Post('user/:id/roles')
  @RequirePermissions('user:assign_role')
  @OperationLog('系统管理', '分配用户角色')
  assignRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignRolesDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.userService.assignRoles(id, dto, user);
  }

  @Post('user/:id/reset-password')
  @RequirePermissions('user:reset_pwd')
  @OperationLog('系统管理', '重置密码')
  resetPwd(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.userService.resetPassword(id, dto, user);
  }

  @Post('user/:id/status/:status')
  @RequirePermissions('user:update')
  @OperationLog('系统管理', '启停账号')
  toggleStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('status', ParseIntPipe) status: number,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.userService.toggleStatus(id, status, user);
  }

  @Delete('user')
  @RequirePermissions('user:delete')
  @OperationLog('系统管理', '批量删除用户')
  removeUsers(
    @Body('ids') ids: number[],
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.userService.removeMany(ids, user);
  }

  // ===== 角色 =====
  @Get('role')
  @RequirePermissions('system:role')
  roleList(@CurrentUser() user: CurrentUserPayload) {
    return this.roleService.findAll(user);
  }

  @Post('role')
  @RequirePermissions('role:create')
  @OperationLog('系统管理', '新增角色')
  createRole(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.roleService.create(dto, user);
  }

  @Put('role/:id')
  @RequirePermissions('role:update')
  @OperationLog('系统管理', '修改角色')
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.roleService.update(id, dto, user);
  }

  @Delete('role/:id')
  @RequirePermissions('role:delete')
  @OperationLog('系统管理', '删除角色')
  removeRole(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.roleService.remove(id, user);
  }

  @Get('role/:id/permissions')
  @RequirePermissions('system:role')
  rolePerms(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.roleService.getPermissions(id, user);
  }

  @Post('role/:id/permissions')
  @RequirePermissions('role:assign_perm')
  @OperationLog('系统管理', '分配角色权限')
  assignPerms(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignPermsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.roleService.assignPermissions(id, dto, user);
  }

  @Get('role/:id/depts')
  @RequirePermissions('system:role')
  roleDepts(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.roleService.getDepts(id, user);
  }

  // ===== 菜单/权限 =====
  /**
   * 权限树。菜单权限页与**角色分配权限对话框**共用一棵树，
   * 故任一菜单即可（OR）——只挂 system:menu 会让「只能管角色、不能改菜单」
   * 的管理员打不开分配权限弹窗。
   */
  @Get('menu/tree')
  @RequireAnyPermissions('system:menu', 'system:role')
  menuTree(@CurrentUser() user: CurrentUserPayload) {
    return this.menuService.tree(user);
  }

  @Post('menu')
  @RequirePermissions('menu:create')
  @OperationLog('系统管理', '新增菜单')
  createMenu(
    @Body() dto: CreatePermissionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.menuService.create(dto, user);
  }

  @Put('menu/:id')
  @RequirePermissions('menu:update')
  @OperationLog('系统管理', '修改菜单')
  updateMenu(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePermissionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.menuService.update(id, dto, user);
  }

  @Delete('menu/:id')
  @RequirePermissions('menu:delete')
  @OperationLog('系统管理', '删除菜单')
  removeMenu(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.menuService.remove(id, user);
  }

  // ===== 字典 =====
  /** 按类型取字典（所有登录用户可用，前端下拉） */
  @Get('dict/type/:type')
  dictByType(@Param('type') type: string) {
    return this.dictService.byType(type);
  }

  @Get('dict')
  @RequirePermissions('system:dict')
  dictList(@Query('dictType') dictType?: string) {
    return this.dictService.findList(dictType);
  }

  @Get('dict/types')
  @RequirePermissions('system:dict')
  dictTypes() {
    return this.dictService.types();
  }

  @Post('dict')
  @RequirePermissions('dict:create')
  @OperationLog('系统管理', '新增字典项')
  createDict(@Body() body: any, @CurrentUser() user: CurrentUserPayload) {
    return this.dictService.create(body, user);
  }

  @Put('dict/:id')
  @RequirePermissions('dict:update')
  @OperationLog('系统管理', '修改字典项')
  updateDict(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dictService.update(id, body, user);
  }

  @Delete('dict/:id')
  @RequirePermissions('dict:delete')
  @OperationLog('系统管理', '删除字典项')
  removeDict(@Param('id', ParseIntPipe) id: number) {
    return this.dictService.remove(id);
  }

  /** 导出字典到 Excel（可按类型筛选，或按 ids 导出勾选记录） */
  @Get('dict/export')
  @SkipTransform()
  @RequirePermissions('dict:export')
  @OperationLog('系统管理', '导出字典')
  async dictExport(
    @Query('dictType') dictType: string,
    @Query('ids') idsStr: string,
    @Res() res: Response,
  ) {
    const ids = parseIdsQuery(idsStr);
    const buffer = await this.dictService.exportToExcel(dictType, ids);
    const filename = '数据字典.xlsx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="dict.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /** 下载字典导入模板 */
  @Get('dict/template')
  @SkipTransform()
  @RequirePermissions('dict:import')
  async dictTemplate(@Res() res: Response) {
    const buffer = await this.dictService.buildImportTemplate();
    const filename = '字典导入模板.xlsx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="dict_template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /** 批量导入字典 */
  @Post('dict/import')
  @RequirePermissions('dict:import')
  @OperationLog('系统管理', '批量导入字典')
  @UseInterceptors(FileInterceptor('file'))
  async dictImport(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) throw new BadRequestException('请选择要上传的 Excel 文件');
    const name = (file.originalname || '').toLowerCase();
    if (!name.endsWith('.xlsx')) {
      throw new BadRequestException('仅支持 .xlsx 格式文件');
    }
    return this.dictService.importFromExcel(file.buffer, user);
  }

  // ===== 部门 =====
  /**
   * 部门树/列表。**跨页引用型只读接口，刻意只要求登录**：
   * 部门信息页、用户管理（选所属部门）、角色数据范围（自定义部门）三处共用，
   * 挂 basic:dept 会让只有用户管理权限的管理员选不到部门。
   */
  @Get('dept/tree')
  deptTree() {
    return this.deptService.tree();
  }

  @Get('dept')
  deptList() {
    return this.deptService.findAll();
  }

  @Post('dept')
  @RequirePermissions('dept:create')
  @OperationLog('部门信息', '新增部门')
  createDept(@Body() body: any, @CurrentUser() user: CurrentUserPayload) {
    return this.deptService.create(body, user);
  }

  @Put('dept/:id')
  @RequirePermissions('dept:update')
  @OperationLog('部门信息', '修改部门')
  updateDept(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.deptService.update(id, body, user);
  }

  @Delete('dept/:id')
  @RequirePermissions('dept:delete')
  @OperationLog('部门信息', '删除部门')
  removeDept(@Param('id', ParseIntPipe) id: number) {
    return this.deptService.remove(id);
  }

  // ===== 操作日志 =====
  @Get('log/modules')
  @RequirePermissions('system:log')
  logModules() {
    return this.logService.modules();
  }

  @Get('log/actions')
  @RequirePermissions('system:log')
  logActions(@Query('module') module?: string) {
    return this.logService.actions(module);
  }

  @Get('log')
  @RequirePermissions('system:log')
  logList(@Query() query: any) {
    return this.logService.findList(query);
  }

  @Delete('log')
  @RequirePermissions('log:delete')
  @OperationLog('系统管理', '批量删除操作日志')
  removeLogs(
    @Body('ids') ids: number[],
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.logService.removeMany(ids, user);
  }

  // ===== 部件主数据 =====
  /**
   * 按部件代码精确查询（订单录入自动带出用）。
   * **跨页引用型只读接口，刻意只要求登录**：录订单的人未必有部件信息菜单。
   */
  @Get('material/by-code')
  getMaterialByCode(@Query('code') code: string) {
    return this.materialService.findByCode(code);
  }

  @Get('material/item-nos')
  @RequirePermissions('basic:material')
  materialItemNumbers() {
    return this.materialService.itemNumbers();
  }

  /** 下载批量导入模板（带样式与下拉的 xlsx） */
  @Get('material/template')
  @SkipTransform()
  @RequirePermissions('material:import')
  async materialTemplate(@Res() res: Response) {
    const buffer = await this.materialService.buildImportTemplate();
    const filename = '部件导入模板.xlsx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="material_template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /** 批量导入部件（上传 xlsx，返回逐行结果汇总） */
  @Post('material/import')
  @RequirePermissions('material:import')
  @OperationLog('系统管理', '批量导入部件')
  @UseInterceptors(FileInterceptor('file'))
  async materialImport(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) throw new BadRequestException('请选择要上传的 Excel 文件');
    const name = (file.originalname || '').toLowerCase();
    if (!name.endsWith('.xlsx')) {
      throw new BadRequestException('仅支持 .xlsx 格式文件');
    }
    return this.materialService.importFromExcel(file.buffer, user);
  }

  /** 导出部件清单为 Excel（遵循列表筛选不分页；有 ids 时仅导出勾选记录） */
  @Get('material/export')
  @SkipTransform()
  @RequirePermissions('material:export')
  @OperationLog('系统管理', '导出部件清单')
  async materialExport(@Query() query: QueryMaterialDto, @Res() res: Response) {
    const ids = parseIdsQuery(query.ids);
    const buffer = await this.materialService.exportList(query, ids);
    const filename = `部件清单_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="material_list.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /**
   * 部件信息列表。读权限用菜单权限点 `basic:material`——
   * 2026-08-07 该菜单由「物料管理」移入「基础数据」并改码，守卫却仍写着旧码
   * `system:material`（清单里已不存在），授了新菜单的角色打开页面必 403，
   * 仅靠 admin 旁路掩盖着。迁移会清掉库中残留的旧权限行。
   */
  @Get('material')
  @RequirePermissions('basic:material')
  materialList(@Query() query: QueryMaterialDto) {
    return this.materialService.findList(query);
  }

  @Post('material')
  @RequirePermissions('material:create')
  @OperationLog('系统管理', '新增部件')
  createMaterial(@Body() dto: CreateMaterialDto, @CurrentUser() user: CurrentUserPayload) {
    return this.materialService.create(dto, user);
  }

  @Put('material/:id')
  @RequirePermissions('material:update')
  @OperationLog('系统管理', '修改部件')
  updateMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.materialService.update(id, dto, user);
  }

  @Delete('material/:id')
  @RequirePermissions('material:delete')
  @OperationLog('系统管理', '删除部件')
  removeMaterial(@Param('id', ParseIntPipe) id: number) {
    return this.materialService.remove(id);
  }
}
