import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestContext } from '../auth.types';

export const CurrentContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext =>
    context.switchToHttp().getRequest<RequestContext>(),
);
