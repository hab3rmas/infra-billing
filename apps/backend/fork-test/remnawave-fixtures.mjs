// Snapshot repeating the owner's scheme (section 0 of the task): the RU bridge "madkid", the Polish
// exit "api-pl" with two IPs (A listens, B is sendThrough), a Steal node with WARP, the panel and a
// subscription page.
export const INT = '11111111-1111-4111-8111-111111111111';
export const MADKID = 'aaaaaaaa-0000-4000-8000-000000000001';
export const APIPL = 'aaaaaaaa-0000-4000-8000-000000000002';
export const STEAL = 'aaaaaaaa-0000-4000-8000-000000000003';
const P_RU = 'bbbbbbbb-0000-4000-8000-000000000001';
const P_PL = 'bbbbbbbb-0000-4000-8000-000000000002';
const P_SG = 'bbbbbbbb-0000-4000-8000-000000000003';
const IB_RU = 'cccccccc-0000-4000-8000-000000000001';
const IB_PL = 'cccccccc-0000-4000-8000-000000000002';
const IB_SG = 'cccccccc-0000-4000-8000-000000000003';

export const snapshot = () => ({
  integrationUuid: INT,
  panelUrl: 'https://panel.zxcnub.xyz',
  subscriptionUrl: 'https://sub.zxcnub.xyz/',
  panelServiceUuid: null,
  subServiceUuid: null,
  nodes: [
    {
      uuid: MADKID,
      name: 'madkid',
      address: 'madkid.zxcnub.xyz',
      port: 2222,
      countryCode: 'RU',
      isConnected: true,
      isDisabled: false,
      configProfileUuid: P_RU,
      activeInboundUuids: [IB_RU],
    },
    {
      uuid: APIPL,
      name: 'api-pl',
      address: 'api-pl.zxcnub.xyz',
      port: 2222,
      countryCode: 'PL',
      isConnected: true,
      isDisabled: false,
      configProfileUuid: P_PL,
      activeInboundUuids: [IB_PL],
    },
    {
      uuid: STEAL,
      name: 'steal-sg',
      address: '198.51.100.7',
      port: 2222,
      countryCode: 'SG',
      isConnected: false,
      isDisabled: false,
      configProfileUuid: P_SG,
      activeInboundUuids: [IB_SG],
    },
  ],
  profiles: [
    {
      uuid: P_RU,
      name: 'RU-BRIDGE',
      inbounds: [{ uuid: IB_RU, tag: 'RU-BRIDGE' }],
      config: {
        inbounds: [{ tag: 'RU-BRIDGE', listen: '0.0.0.0', port: 443, protocol: 'vless' }],
        outbounds: [
          { tag: 'DIRECT', protocol: 'freedom' },
          {
            tag: 'PL-OUT',
            protocol: 'vless',
            settings: { vnext: [{ address: 'api-pl.zxcnub.xyz', port: 443 }] },
            streamSettings: { network: 'xhttp', security: 'reality' },
          },
          { tag: 'BLOCK', protocol: 'blackhole' },
        ],
        routing: {
          rules: [
            { vlessRoute: 1, outboundTag: 'DIRECT', inboundTag: ['RU-BRIDGE'] },
            { vlessRoute: 2, outboundTag: 'PL-OUT', inboundTag: ['RU-BRIDGE'] },
            { domain: ['geosite:category-ru'], ip: ['geoip:ru'], outboundTag: 'DIRECT' },
          ],
        },
      },
    },
    {
      uuid: P_PL,
      name: 'exit-pl',
      inbounds: [{ uuid: IB_PL, tag: 'PL-IN' }],
      config: {
        inbounds: [{ tag: 'PL-IN', listen: '203.0.113.10', port: 443, protocol: 'vless' }],
        outbounds: [{ tag: 'DIRECT', protocol: 'freedom', sendThrough: '203.0.113.11' }],
        routing: { rules: [] },
      },
    },
    {
      uuid: P_SG,
      name: 'RU-SG',
      inbounds: [{ uuid: IB_SG, tag: 'SG-IN' }],
      config: {
        inbounds: [{ tag: 'SG-IN', listen: '0.0.0.0', port: 443, protocol: 'vless' }],
        outbounds: [
          { tag: 'DIRECT', protocol: 'freedom' },
          {
            tag: 'warp-out',
            protocol: 'wireguard',
            settings: { peers: [{ endpoint: 'engage.cloudflareclient.com:2408' }] },
          },
        ],
        routing: { rules: [{ domain: ['geosite:netflix'], outboundTag: 'warp-out' }] },
      },
    },
  ],
  hosts: [
    {
      uuid: 'dddddddd-0000-4000-8000-000000000001',
      remark: 'RU-BRIDGE direct',
      address: 'madkid.zxcnub.xyz',
      port: 443,
      isDisabled: false,
      inboundUuid: IB_RU,
      configProfileUuid: P_RU,
      vlessRoute: 1,
    },
    {
      uuid: 'dddddddd-0000-4000-8000-000000000002',
      remark: 'RU-BRIDGE via PL',
      address: 'madkid.zxcnub.xyz',
      port: 443,
      isDisabled: false,
      inboundUuid: IB_RU,
      configProfileUuid: P_RU,
      vlessRoute: 2,
    },
    {
      uuid: 'dddddddd-0000-4000-8000-000000000003',
      remark: 'off',
      address: 'x',
      port: 443,
      isDisabled: true,
      inboundUuid: IB_SG,
      configProfileUuid: P_SG,
      vlessRoute: null,
    },
  ],
});
