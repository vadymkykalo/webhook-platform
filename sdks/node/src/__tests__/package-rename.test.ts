import { Hookflow } from '@hookflow/node';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json');

// Regression test for the package rename (@webhook-platform/node -> @hookflow/node).
// This must fail loudly if either the manifest or the published export surface
// ever drifts away from the new package identity.
describe('package rename (@hookflow/node)', () => {
  it('is published under the new package name', () => {
    expect(pkg.name).toBe('@hookflow/node');
  });

  it('smoke: importing "@hookflow/node" constructs a working client', () => {
    const client = new Hookflow({ apiKey: 'test_api_key' });
    expect(client).toBeInstanceOf(Hookflow);
    expect(client.events).toBeDefined();
  });
});
