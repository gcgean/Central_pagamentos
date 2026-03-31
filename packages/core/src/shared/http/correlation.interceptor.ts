import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Observable, tap } from 'rxjs'

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CorrelationInterceptor.name)

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<any>()
    const response = http.getResponse<any>()
    const startedAt = Date.now()
    const correlationId = request.headers?.['x-correlation-id'] ?? randomUUID()

    request.correlationId = correlationId
    if (typeof response.header === 'function') {
      response.header('x-correlation-id', correlationId)
    } else if (typeof response.setHeader === 'function') {
      response.setHeader('x-correlation-id', correlationId)
    }

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `[${correlationId}] ${request.method} ${request.url} ${response.statusCode} ${Date.now() - startedAt}ms`,
          )
        },
        error: () => {
          this.logger.warn(
            `[${correlationId}] ${request.method} ${request.url} ${response.statusCode} ${Date.now() - startedAt}ms`,
          )
        },
      }),
    )
  }
}
