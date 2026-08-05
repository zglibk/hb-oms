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
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
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
  userList(@Query() query: QueryUserDto) {
    return this.userService.findList(query);
  }

  @Get('user/:id')
  @RequirePermissions('system:user')
  userDetail(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findOne(id);
  }

  @Post('user')
  @RequirePermissions('user:create')
  @OperationLog('系统管理', '新增用户')
  createUser(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Put('user/:id')
  @RequirePermissions('user:update')
  @OperationLog('系统管理', '修改用户')
  updateUser(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Post('user/:id/roles')
  @RequirePermissions('user:assign_role')
  @OperationLog('系统管理', '分配用户角色')
  assignRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignRolesDto,
  ) {
    return this.userService.assignRoles(id, dto);
  }

  @Post('user/:id/reset-password')
  @RequirePermissions('user:reset_pwd')
  @OperationLog('系统管理', '重置密码')
  resetPwd(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.userService.resetPassword(id, dto);
  }

  @Post('user/:id/status/:status')
  @RequirePermissions('user:update')
  @OperationLog('系统管理', '启停账号')
  toggleStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('status', ParseIntPipe) status: number,
  ) {
    return this.userService.toggleStatus(id, status);
  }

  @Delete('user')
  @RequirePermissions('user:delete')
  @OperationLog('系统管理', '批量删除用户')
  removeUsers(
    @Body('ids') ids: number[],
    @CurrentUser('id') currentUserId: number,
  ) {
    return this.userService.removeMany(ids, currentUserId);
  }

  // ===== 角色 =====
  @Get('role')
  @RequirePermissions('system:role')
  roleList() {
    return this.roleService.findAll();
  }

  @Post('role')
  @RequirePermissions('role:create')
  @OperationLog('系统管理', '新增角色')
  createRole(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Put('role/:id')
  @RequirePermissions('role:update')
  @OperationLog('系统管理', '修改角色')
  updateRole(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(id, dto);
  }

  @Delete('role/:id')
  @RequirePermissions('role:delete')
  @OperationLog('系统管理', '删除角色')
  removeRole(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.remove(id);
  }

  @Get('role/:id/permissions')
  @RequirePermissions('system:role')
  rolePerms(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.getPermissions(id);
  }

  @Post('role/:id/permissions')
  @RequirePermissions('role:assign_perm')
  @OperationLog('系统管理', '分配角色权限')
  assignPerms(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignPermsDto,
  ) {
    return this.roleService.assignPermissions(id, dto);
  }

  @Get('role/:id/depts')
  @RequirePermissions('system:role')
  roleDepts(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.getDepts(id);
  }

  // ===== 菜单/权限 =====
  @Get('menu/tree')
  @RequirePermissions('system:menu')
  menuTree() {
    return this.menuService.tree();
  }

  @Post('menu')
  @RequirePermissions('menu:create')
  @OperationLog('系统管理', '新增菜单')
  createMenu(@Body() dto: CreatePermissionDto) {
    return this.menuService.create(dto);
  }

  @Put('menu/:id')
  @RequirePermissions('menu:update')
  @OperationLog('系统管理', '修改菜单')
  updateMenu(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.menuService.update(id, dto);
  }

  @Delete('menu/:id')
  @RequirePermissions('menu:delete')
  @OperationLog('系统管理', '删除菜单')
  removeMenu(@Param('id', ParseIntPipe) id: number) {
    return this.menuService.remove(id);
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
  createDict(@Body() body: any) {
    return this.dictService.create(body);
  }

  @Put('dict/:id')
  @RequirePermissions('dict:update')
  @OperationLog('系统管理', '修改字典项')
  updateDict(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.dictService.update(id, body);
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
  async dictImport(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择要上传的 Excel 文件');
    const name = (file.originalname || '').toLowerCase();
    if (!name.endsWith('.xlsx')) {
      throw new BadRequestException('仅支持 .xlsx 格式文件');
    }
    return this.dictService.importFromExcel(file.buffer);
  }

  // ===== 部门 =====
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
  createDept(@Body() body: any) {
    return this.deptService.create(body);
  }

  @Put('dept/:id')
  @RequirePermissions('dept:update')
  @OperationLog('部门信息', '修改部门')
  updateDept(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.deptService.update(id, body);
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

  // ===== 物料主数据 =====
  /** 按物料代码精确查询（订单录入自动带出用） */
  @Get('material/by-code')
  getMaterialByCode(@Query('code') code: string) {
    return this.materialService.findByCode(code);
  }

  @Get('material/item-nos')
  @RequirePermissions('system:material')
  materialItemNumbers() {
    return this.materialService.itemNumbers();
  }

  /** 下载批量导入模板（带样式与下拉的 xlsx） */
  @Get('material/template')
  @SkipTransform()
  @RequirePermissions('material:import')
  async materialTemplate(@Res() res: Response) {
    const buffer = await this.materialService.buildImportTemplate();
    const filename = '物料导入模板.xlsx';
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

  /** 批量导入物料（上传 xlsx，返回逐行结果汇总） */
  @Post('material/import')
  @RequirePermissions('material:import')
  @OperationLog('系统管理', '批量导入物料')
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

  /** 导出物料清单为 Excel（遵循列表筛选不分页；有 ids 时仅导出勾选记录） */
  @Get('material/export')
  @SkipTransform()
  @RequirePermissions('material:export')
  @OperationLog('系统管理', '导出物料清单')
  async materialExport(@Query() query: QueryMaterialDto, @Res() res: Response) {
    const ids = parseIdsQuery(query.ids);
    const buffer = await this.materialService.exportList(query, ids);
    const filename = `物料清单_${new Date()
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

  @Get('material')
  @RequirePermissions('system:material')
  materialList(@Query() query: QueryMaterialDto) {
    return this.materialService.findList(query);
  }

  @Post('material')
  @RequirePermissions('material:create')
  @OperationLog('系统管理', '新增物料')
  createMaterial(@Body() dto: CreateMaterialDto, @CurrentUser() user: CurrentUserPayload) {
    return this.materialService.create(dto, user);
  }

  @Put('material/:id')
  @RequirePermissions('material:update')
  @OperationLog('系统管理', '修改物料')
  updateMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.materialService.update(id, dto, user);
  }

  @Delete('material/:id')
  @RequirePermissions('material:delete')
  @OperationLog('系统管理', '删除物料')
  removeMaterial(@Param('id', ParseIntPipe) id: number) {
    return this.materialService.remove(id);
  }
}
