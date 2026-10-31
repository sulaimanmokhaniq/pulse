import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard, AuthedRequest, SecretKeyGuard } from '../auth/api-key.guard';
import { ProjectThrottlerGuard } from '../auth/project-throttler.guard';
import { EvaluateDto, FlagKeyParam, UpdateFlagDto, UpsertFlagDto } from './flags.dto';
import { FlagsService } from './flags.service';

/** Client apps ask which flags are on for the current user, with their ingest key. */
@Controller('v1/flags/evaluate')
@UseGuards(ApiKeyGuard, ProjectThrottlerGuard)
export class FlagsEvaluateController {
  constructor(private readonly flags: FlagsService) {}

  @Post()
  @HttpCode(200)
  async evaluate(@Req() req: AuthedRequest, @Body() body: EvaluateDto) {
    return { flags: await this.flags.evaluate(req.apiKey.projectId, body.distinctId) };
  }
}

/** Managing flags needs a secret key. */
@Controller('v1/flags')
@UseGuards(SecretKeyGuard, ProjectThrottlerGuard)
export class FlagsAdminController {
  constructor(private readonly flags: FlagsService) {}

  @Get()
  async list(@Req() req: AuthedRequest) {
    return { flags: await this.flags.list(req.apiKey.projectId) };
  }

  @Get(':key')
  async get(@Req() req: AuthedRequest, @Param() { key }: FlagKeyParam) {
    const flag = await this.flags.get(req.apiKey.projectId, key);
    if (!flag) throw new NotFoundException(`No flag "${key}"`);
    return flag;
  }

  /** Creates the flag or replaces its settings. */
  @Put(':key')
  async upsert(@Req() req: AuthedRequest, @Param() { key }: FlagKeyParam, @Body() body: UpsertFlagDto) {
    return this.flags.upsert(req.apiKey.projectId, key, body);
  }

  /** Changes some settings of an existing flag. */
  @Patch(':key')
  async update(@Req() req: AuthedRequest, @Param() { key }: FlagKeyParam, @Body() body: UpdateFlagDto) {
    const flag = await this.flags.update(req.apiKey.projectId, key, body);
    if (!flag) throw new NotFoundException(`No flag "${key}"`);
    return flag;
  }

  @Delete(':key')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param() { key }: FlagKeyParam) {
    if (!(await this.flags.remove(req.apiKey.projectId, key))) throw new NotFoundException(`No flag "${key}"`);
  }
}
