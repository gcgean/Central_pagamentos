import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'

@ApiExcludeController()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'hub-billing-core',
      timestamp: new Date().toISOString(),
    }
  }
}
