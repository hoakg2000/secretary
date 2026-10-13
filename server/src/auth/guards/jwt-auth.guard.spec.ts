import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

const context = { getHandler: () => null, getClass: () => null } as any;

describe('JwtAuthGuard', () => {
  it('lets @Public() routes through without a token', () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    expect(new JwtAuthGuard(reflector).canActivate(context)).toBe(true);
  });

  it('defers to passport-jwt for everything else', () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const parent = vi
      .spyOn(AuthGuard('jwt').prototype, 'canActivate')
      .mockReturnValue(false);
    expect(new JwtAuthGuard(reflector).canActivate(context)).toBe(false);
    expect(parent).toHaveBeenCalled();
  });
});
