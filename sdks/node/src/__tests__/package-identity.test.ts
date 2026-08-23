import { Hookflow } from '@webhook-platform/node';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json');

// Guards the published identity of this SDK: the manifest name and the export
// surface a consumer gets from `npm install @webhook-platform/node` must not
// drift apart.
describe('package identity (@webhook-platform/node)', () => {
  it('is published under the @webhook-platform/node package name', () => {
    expect(pkg.name).toBe('@webhook-platform/node');
  });

  it('smoke: importing "@webhook-platform/node" constructs a working client', () => {
    const client = new Hookflow({ apiKey: 'test_api_key' });
    expect(client).toBeInstanceOf(Hookflow);
    expect(client.events).toBeDefined();
  });
});
