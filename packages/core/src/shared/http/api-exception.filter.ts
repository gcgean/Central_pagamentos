import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<any>()
    const request = ctx.getRequest<any>()

    const correlationId = request.headers?.['x-correlation-id'] ?? request.correlationId ?? null

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let code = 'INTERNAL_ERROR'
    let message = 'Erro interno do servidor.'
    let details: unknown = null

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const raw = exception.getResponse()
      const normalized = typeof raw === 'string' ? { message: raw } : (raw as Record<string, unknown>)
      const rawMessage = normalized?.message

      if (Array.isArray(rawMessage)) {
        message = rawMessage.join('; ')
        details = rawMessage
      } else if (typeof rawMessage === 'string') {
        message = rawMessage
      } else {
        message = exception.message
      }

      code =
        status === HttpStatus.UNAUTHORIZED ? 'UNAUTHORIZED' :
        status === HttpStatus.FORBIDDEN ? 'FORBIDDEN' :
        status === HttpStatus.NOT_FOUND ? 'NOT_FOUND' :
        status === HttpStatus.UNPROCESSABLE_ENTITY ? 'VALIDATION_ERROR' :
        status === HttpStatus.BAD_REQUEST ? 'BAD_REQUEST' :
        status === HttpStatus.TOO_MANY_REQUESTS ? 'RATE_LIMIT_EXCEEDED' :
        status === HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_ERROR' :
        `HTTP_${status}`
    }

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      message = 'Limite de requisições excedido. Aguarde alguns segundos e tente novamente.'
    }

    if (status >= 500) {
      this.logger.error(
        `Erro ${status} em ${request.method} ${request.url}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      )
    } else {
      this.logger.warn(`Falha ${status} em ${request.method} ${request.url}: ${message}`)
    }

    response.status(status).send({
      code,
      message,
      details,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
      statusCode: status,
    })
  }
}
