import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AuthController } from './auth.controller'
import { AuditService } from './audit.service'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'

import { AdminInitService } from './admin-init.service'

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRY', '8h') },
      }),
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [AdminController, AuthController],
  providers: [AuditService, AdminJwtGuard, AdminInitService],
  exports: [AuditService, AdminJwtGuard],
})
export class AdminModule {}
