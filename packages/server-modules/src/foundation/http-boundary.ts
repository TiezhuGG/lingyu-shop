import { ArgumentsHost, BadRequestException, Catch, createParamDecorator, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface RequestIdRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  requestId?: string;
}

interface ResponseWriter {
  setHeader(name: string, value: string): void;
  status(code: number): ResponseWriter;
  json(body: unknown): void;
}

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/;
const defaultRequestId = (): string => randomUUID();

export function requestIdMiddleware(request: RequestIdRequest, response: ResponseWriter, next: () => void): void {
  const candidate = request.headers['x-request-id'];
  const requestId = typeof candidate === 'string' && requestIdPattern.test(candidate) ? candidate : defaultRequestId();
  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}

export const RequestId = createParamDecorator((_data: unknown, context): string => {
  const request = context.switchToHttp().getRequest<RequestIdRequest>();
  return request.requestId ?? defaultRequestId();
});

export type ValidationRule = 'additionalProperties' | 'enum' | 'minLength' | 'pattern' | 'required' | 'type';
export interface ValidationDetails {
  readonly fields: ReadonlyArray<{ readonly path: string; readonly rule: ValidationRule }>;
}

export class ContractValidationException extends BadRequestException {
  constructor(readonly details: ValidationDetails) {
    super();
  }
}

type ErrorDescriptor = { readonly code: string; readonly message: string };
const errors: Readonly<Record<number, ErrorDescriptor>> = {
  [HttpStatus.BAD_REQUEST]: { code: 'VALIDATION_FAILED', message: 'Request validation failed' },
  [HttpStatus.UNAUTHORIZED]: { code: 'UNAUTHENTICATED', message: 'Authentication is required' },
  [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: 'Access is denied' },
  [HttpStatus.NOT_FOUND]: { code: 'NOT_FOUND', message: 'Resource not found' },
  [HttpStatus.CONFLICT]: { code: 'CONFLICT', message: 'Request conflicts with current state' },
  [HttpStatus.UNPROCESSABLE_ENTITY]: { code: 'VALIDATION_FAILED', message: 'Request cannot be processed' },
  [HttpStatus.TOO_MANY_REQUESTS]: { code: 'RATE_LIMITED', message: 'Too many requests' },
  [HttpStatus.SERVICE_UNAVAILABLE]: { code: 'SERVICE_UNAVAILABLE', message: 'Service is not ready' },
};

@Catch()
export class HttpBoundaryFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestIdRequest>();
    const response = http.getResponse<ResponseWriter>();
    const requestId = request.requestId ?? defaultRequestId();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const descriptor = errors[status] ?? { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
    const body: Record<string, unknown> = { ...descriptor, requestId };
    if (exception instanceof ContractValidationException) body.details = exception.details;
    if (!(exception instanceof HttpException)) console.error('API_UNHANDLED_ERROR requestId=' + requestId);
    response.setHeader('x-request-id', requestId);
    response.status(status).json(body);
  }
}
