import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('reports status "ok"', () => {
    expect(controller.check().status).toBe('ok');
  });

  it('reports a rounded, non-negative uptime', () => {
    jest.spyOn(process, 'uptime').mockReturnValue(1234.678);

    const result = controller.check();

    expect(result.uptime).toBe(1235);
    expect(Number.isInteger(result.uptime)).toBe(true);

    jest.restoreAllMocks();
  });

  it('exposes only status and uptime', () => {
    expect(Object.keys(controller.check()).sort()).toEqual([
      'status',
      'uptime',
    ]);
  });
});
