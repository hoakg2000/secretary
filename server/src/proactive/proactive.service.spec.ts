import { ProactiveService } from './proactive.service';
import { ProactiveTriggerType } from './dto/trigger-proactive.dto';

function build(timeZone: string) {
  const event: any = {
    id: 'e1',
    title: 'Họp',
    startTime: new Date('2026-10-15T02:30:00Z'),
    remindedAt: null,
  };
  const prisma: any = {
    localCalendar: {
      // honours the remindedAt: null filter the way the DB would
      findMany: vi.fn(async ({ where }: any) =>
        where.remindedAt === null && event.remindedAt === null ? [event] : [],
      ),
      update: vi.fn(async ({ data }: any) => Object.assign(event, data)),
    },
  };
  const config: any = { get: () => timeZone };
  const service = new ProactiveService(prisma, config);
  const trigger = vi.spyOn(service, 'evaluateAndTrigger');
  return { prisma, service, trigger };
}

describe('ProactiveService', () => {
  it('reports LOGGED, not SENT, while no channel is implemented', async () => {
    const { service } = build('UTC');
    const result = await service.evaluateAndTrigger({
      type: ProactiveTriggerType.CUSTOM,
      message: 'hi',
    });
    expect(result.success).toBe(false);
    expect(result.result.status).toBe('LOGGED');
  });

  it('two consecutive cron runs over the same event dispatch once', async () => {
    const { prisma, service, trigger } = build('UTC');

    await service.handleFallbackCron();
    await service.handleFallbackCron();

    expect(trigger).toHaveBeenCalledTimes(1);
    expect(prisma.localCalendar.findMany.mock.calls[0][0].where).toMatchObject({
      remindedAt: null,
      deletedAt: null,
    });
  });

  it('formats the reminder time in APP_TIMEZONE', async () => {
    const utc = build('UTC');
    await utc.service.handleFallbackCron();
    const hcm = build('Asia/Ho_Chi_Minh');
    await hcm.service.handleFallbackCron();

    expect(utc.trigger.mock.calls[0][0].message).toContain('02:30');
    expect(hcm.trigger.mock.calls[0][0].message).toContain('09:30');
  });
});
