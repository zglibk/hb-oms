import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { printDriverOrientationOf, PRINT_FONT_SCALE_MAX, PRINT_FONT_SCALE_MIN } from '@hb-oms/shared';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditDisplayName, auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import { CreatePrintProfileDto, RuntimePrintProfileQueryDto, SetPrintDefaultDto, UpdatePrintProfileDto } from './dto/print-config.dto';
import { PrintDocumentSetting } from './entities/print-document-setting.entity';
import { PrintProfileVersion } from './entities/print-profile-version.entity';
import { PrintProfile } from './entities/print-profile.entity';
import type { PrintDocumentType, PrintLayoutTable, PrintProfileConfig } from './print-config.types';

/** 配置对象稳定序列化：忽略 JSON 对象键顺序，用于识别名称不同但发布配置完全相同的重复纸型。 */
function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 为旧纸型响应补齐驱动方向；只返回新对象，不改写历史发布快照。 */
function normalizeConfig(config: PrintProfileConfig): PrintProfileConfig {
  if (!config?.paper || config.paper.driverOrientation !== undefined) return config;
  return {
    ...config,
    paper: { ...config.paper, driverOrientation: printDriverOrientationOf(config.paper) },
  };
}

@Injectable()
export class PrintConfigService {
  constructor(
    @InjectRepository(PrintProfile) private readonly profileRepo: Repository<PrintProfile>,
    @InjectRepository(PrintProfileVersion) private readonly versionRepo: Repository<PrintProfileVersion>,
    @InjectRepository(PrintDocumentSetting) private readonly settingRepo: Repository<PrintDocumentSetting>,
    private readonly dataSource: DataSource,
  ) {}

  async list(documentType?: PrintDocumentType) {
    const qb = this.profileRepo.createQueryBuilder('p')
      .leftJoin(PrintProfileVersion, 'v', 'v.id = p.published_version_id')
      .select(['p.id AS id', 'p.name AS name', 'p.document_type AS documentType', 'p.status AS status',
        'p.is_builtin AS isBuiltin', 'p.published_version_id AS publishedVersionId',
        'v.version_no AS publishedVersionNo', 'p.updated_at AS updatedAt'])
      .orderBy('p.document_type', 'ASC').addOrderBy('p.is_builtin', 'DESC').addOrderBy('p.id', 'ASC');
    if (documentType) qb.where('p.document_type = :documentType', { documentType });
    return qb.getRawMany();
  }

  async detail(id: number) {
    const profile = await this.getProfile(id);
    const published = profile.publishedVersionId
      ? await this.versionRepo.findOneBy({ id: profile.publishedVersionId })
      : null;
    return {
      ...profile,
      draftConfig: normalizeConfig(profile.draftConfig),
      publishedConfig: published ? normalizeConfig(published.configJson) : null,
      publishedVersionNo: published?.versionNo ?? null,
    };
  }

  async create(dto: CreatePrintProfileDto, user: CurrentUserPayload) {
    const config = normalizeConfig(dto.config);
    this.validateConfig(config);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('纸型名称不能为空');
    await this.ensureUniqueName(dto.documentType, name);
    return this.profileRepo.save(this.profileRepo.create({
      name, documentType: dto.documentType, status: 1, isBuiltin: 0,
      draftConfig: config, publishedVersionId: null, ...auditOnCreate(user),
    }));
  }

  async update(id: number, dto: UpdatePrintProfileDto, user: CurrentUserPayload) {
    const profile = await this.getProfile(id);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('纸型名称不能为空');
      await this.ensureUniqueName(profile.documentType, name, id);
      profile.name = name;
    }
    if (dto.config !== undefined) {
      const config = normalizeConfig(dto.config);
      this.validateConfig(config);
      profile.draftConfig = config;
    }
    if (dto.status !== undefined && dto.status !== profile.status) {
      if (dto.status === 0 && profile.isBuiltin) throw new BadRequestException('内置回退纸型不能停用');
      if (dto.status === 0) await this.ensureNotDefault(id, '默认纸型不能停用，请先切换默认纸型');
      profile.status = dto.status;
    }
    Object.assign(profile, auditOnUpdate(user));
    return this.profileRepo.save(profile);
  }

  async remove(id: number) {
    const profile = await this.getProfile(id);
    if (profile.isBuiltin) throw new BadRequestException('内置回退纸型不能删除');
    await this.ensureNotDefault(id, '默认纸型不能删除，请先切换默认纸型');
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PrintProfileVersion, { profileId: id });
      await manager.delete(PrintProfile, id);
    });
    return { id };
  }

  async publish(id: number, user: CurrentUserPayload) {
    const profile = await this.getProfile(id);
    const config = normalizeConfig(profile.draftConfig);
    this.validateConfig(config);
    const publisherName = auditDisplayName(user) || null;
    return this.dataSource.transaction(async (manager) => {
      const row = await manager.getRepository(PrintProfileVersion)
        .createQueryBuilder('v').select('MAX(v.version_no)', 'max')
        .where('v.profile_id = :id', { id }).getRawOne<{ max: string | null }>();
      const version = await manager.save(PrintProfileVersion, manager.create(PrintProfileVersion, {
        profileId: id,
        versionNo: Number(row?.max ?? 0) + 1,
        configJson: config,
        publisherId: user.id,
        publisherName,
      }));
      await manager.update(PrintProfile, id, {
        draftConfig: config,
        publishedVersionId: version.id,
        ...auditOnUpdate(user),
      });
      return version;
    });
  }

  versions(profileId: number) {
    return this.versionRepo.find({ where: { profileId }, order: { versionNo: 'DESC' } });
  }

  async rollback(profileId: number, versionNo: number, user: CurrentUserPayload) {
    const source = await this.versionRepo.findOneBy({ profileId, versionNo });
    if (!source) throw new NotFoundException('指定的历史发布版本不存在');
    await this.profileRepo.update(profileId, {
      draftConfig: normalizeConfig(source.configJson),
      ...auditOnUpdate(user),
    });
    return this.publish(profileId, user);
  }

  async defaults() {
    return this.settingRepo.find({ order: { id: 'ASC' } });
  }

  async setDefault(dto: SetPrintDefaultDto, user: CurrentUserPayload) {
    const profile = await this.getProfile(dto.profileId);
    if (profile.documentType !== dto.documentType) throw new BadRequestException('纸型与单据类型不匹配');
    if (!profile.status) throw new BadRequestException('停用纸型不能设为默认');
    if (!profile.publishedVersionId) throw new BadRequestException('纸型尚未发布，不能设为默认');
    const existing = await this.settingRepo.findOneBy({ documentType: dto.documentType });
    const audit = auditOnUpdate(user);
    return this.settingRepo.save(this.settingRepo.create({
      ...(existing ?? {}), documentType: dto.documentType, defaultProfileId: dto.profileId,
      updaterId: audit.updaterId, updaterName: audit.updaterName,
    }));
  }

  async runtime(query: RuntimePrintProfileQueryDto) {
    const settings = await this.settingRepo.findOneBy({ documentType: query.documentType });
    const profiles = await this.profileRepo.find({
      where: { documentType: query.documentType, status: 1 }, order: { isBuiltin: 'DESC', id: 'ASC' },
    });
    const publishedIds = profiles.flatMap((p) => p.publishedVersionId ? [p.publishedVersionId] : []);
    const versions = publishedIds.length
      ? await this.versionRepo.findBy({ id: In(publishedIds) })
      : [];
    const versionById = new Map(versions.map((version) => [version.id, version]));
    const candidates = profiles.flatMap((profile, index) => {
      const version = profile.publishedVersionId ? versionById.get(profile.publishedVersionId) : undefined;
      return version
        ? [{ profile, version, index, signature: stableSerialize(normalizeConfig(version.configJson)) }]
        : [];
    });

    /*
     * 所有正式下拉统一取当前 published_version_id，不读草稿；完全相同的发布配置只保留一项。
     * 重复项选择 version_no 更高者，版本号相同再取发布时间较新的，解决历史迁移留下的
     * 「A5 打字纸 / A5 横向」「针式打印纸 / 连续纸」同配置双档案问题。
     */
    const winners = new Map<string, typeof candidates[number]>();
    for (const candidate of candidates) {
      const current = winners.get(candidate.signature);
      const candidateTime = candidate.version.publishedAt?.getTime() ?? 0;
      const currentTime = current?.version.publishedAt?.getTime() ?? 0;
      if (!current
        || candidate.version.versionNo > current.version.versionNo
        || (candidate.version.versionNo === current.version.versionNo && candidateTime > currentTime)) {
        winners.set(candidate.signature, candidate);
      }
    }
    const canonicalByProfileId = new Map<number, number>();
    for (const candidate of candidates) {
      canonicalByProfileId.set(candidate.profile.id, winners.get(candidate.signature)!.profile.id);
    }
    const selected = [...winners.values()].sort((a, b) => a.index - b.index);
    const options = selected.map(({ profile, version }) => ({
      id: profile.id, name: profile.name, isBuiltin: profile.isBuiltin, version: version.versionNo,
    }));
    const configuredDefaultId = canonicalByProfileId.get(settings?.defaultProfileId ?? 0);
    const requestedProfileId = query.profileId ?? configuredDefaultId ?? options[0]?.id;
    const profileId = query.version
      ? requestedProfileId
      : canonicalByProfileId.get(requestedProfileId ?? 0) ?? requestedProfileId;
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) throw new BadRequestException('所选纸型已停用、已删除或与单据类型不匹配');
    let version: PrintProfileVersion | null;
    if (query.version) version = await this.versionRepo.findOneBy({ profileId: profile.id, versionNo: query.version });
    else version = profile.publishedVersionId ? await this.versionRepo.findOneBy({ id: profile.publishedVersionId }) : null;
    if (!version) throw new BadRequestException('所选纸型尚未发布可用版本');
    return {
      profileId: profile.id, profileName: profile.name, documentType: profile.documentType,
      version: version.versionNo, config: normalizeConfig(version.configJson),
      defaultProfileId: configuredDefaultId ?? options[0]?.id ?? null,
      options,
    };
  }

  private async getProfile(id: number) {
    const profile = await this.profileRepo.findOneBy({ id });
    if (!profile) throw new NotFoundException('纸型不存在');
    return profile;
  }

  private async ensureUniqueName(documentType: PrintDocumentType, name: string, excludeId = 0) {
    const hit = await this.profileRepo.createQueryBuilder('p')
      .where('p.document_type = :documentType AND p.name = :name AND p.id <> :excludeId', { documentType, name, excludeId })
      .getOne();
    if (hit) throw new BadRequestException('同类单据下已存在同名纸型');
  }

  private async ensureNotDefault(id: number, message: string) {
    if (await this.settingRepo.exist({ where: { defaultProfileId: id } })) throw new BadRequestException(message);
  }

  private finite(value: unknown, label: string, min: number, max: number) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new BadRequestException(`${label}必须在 ${min}–${max} 之间`);
    }
  }

  private validateConfig(config: PrintProfileConfig) {
    if (!config || config.schemaVersion !== 1) throw new BadRequestException('不支持的纸型配置版本');
    if (!['blank', 'preprinted'].includes(config.mode)) throw new BadRequestException('打印模式无效');
    this.finite(config.paper?.widthMm, '纸张宽度', 50, 500);
    this.finite(config.paper?.heightMm, '纸张高度', 50, 500);
    if (!['portrait', 'landscape'].includes(config.paper?.driverOrientation ?? '')) {
      throw new BadRequestException('驱动打印方向无效');
    }
    if (config.paper?.bodyWidthMm !== undefined) {
      this.finite(config.paper.bodyWidthMm, '成品纸面宽度', 50, 500);
      if (config.paper.bodyWidthMm > config.paper.widthMm) throw new BadRequestException('成品纸面宽度不能大于驱动进纸宽度');
    }
    if (config.paper?.bodyHeightMm !== undefined) {
      this.finite(config.paper.bodyHeightMm, '成品纸面高度', 50, 500);
      if (config.paper.bodyHeightMm > config.paper.heightMm) throw new BadRequestException('成品纸面高度不能大于驱动进纸高度');
    }
    for (const side of ['top', 'right', 'bottom', 'left'] as const) this.finite(config.margins?.[side], `${side}边距`, 0, 50);
    this.finite(config.offset?.x, 'X偏移', -20, 20);
    this.finite(config.offset?.y, 'Y偏移', -20, 20);
    this.finite(config.style?.fontScale, '字体缩放', PRINT_FONT_SCALE_MIN, PRINT_FONT_SCALE_MAX);
    this.finite(config.style?.borderWidthPt, '线条粗细', 0.1, 3);
    if (!['auto', 'fixed'].includes(config.pagination?.strategy)) throw new BadRequestException('分页方式无效');
    this.finite(config.pagination?.rowsPerPage, '每页明细行数', 1, 50);
    if (config.backgroundImageUrl && !/^\/(?:[^/]+\/)*uploads\//.test(config.backgroundImageUrl)) {
      throw new BadRequestException('定位底图必须使用系统上传文件');
    }
    for (const item of config.layout?.elements ?? []) {
      this.finite(item.xMm, '元素X坐标', -20, 500);
      this.finite(item.yMm, '元素Y坐标', -20, 500);
      this.finite(item.widthMm, '元素宽度', 1, 500);
      this.finite(item.heightMm, '元素高度', 1, 500);
      if (item.type === 'table') {
        this.finite((item as PrintLayoutTable).rowHeightMm, '明细行高', 2, 50);
        const sum = (item as PrintLayoutTable).columns.reduce((n, c) => n + Number(c.widthPct || 0), 0);
        if (Math.abs(sum - 100) > 0.2) throw new BadRequestException('明细列宽合计必须为 100%');
      }
    }
    if (config.mode === 'preprinted' && !(config.layout?.elements?.length)) {
      throw new BadRequestException('预印套打必须至少配置一个定位元素');
    }
  }
}
