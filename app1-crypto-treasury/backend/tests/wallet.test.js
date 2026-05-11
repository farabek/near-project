const { loadAccount, getNEARBalance, getUSDCBalance } = require('../src/wallet');

jest.mock('near-api-js', () => ({
  connect: jest.fn(),
  KeyPair: {
    fromString: jest.fn().mockReturnValue({ secretKey: 'mock_key' }),
  },
  keyStores: {
    InMemoryKeyStore: jest.fn().mockImplementation(() => ({
      setKey: jest.fn(),
    })),
  },
  utils: {
    format: {
      formatNearAmount: jest.fn().mockReturnValue('10.50'),
    },
  },
}));

const nearAPI = require('near-api-js');

describe('wallet', () => {
  describe('loadAccount', () => {
    it('connects to NEAR and returns account object', async () => {
      const mockAccount = { accountId: 'myapp.testnet' };
      const mockNear = { account: jest.fn().mockResolvedValue(mockAccount) };
      nearAPI.connect.mockResolvedValue(mockNear);

      const account = await loadAccount({
        accountId: 'myapp.testnet',
        privateKey: 'ed25519:fakekey',
        networkId: 'testnet',
        nodeUrl: 'https://rpc.testnet.near.org',
      });

      expect(nearAPI.connect).toHaveBeenCalledWith(
        expect.objectContaining({ networkId: 'testnet' })
      );
      expect(mockNear.account).toHaveBeenCalledWith('myapp.testnet');
      expect(account).toBe(mockAccount);
    });
  });

  describe('getNEARBalance', () => {
    it('returns formatted NEAR balance', async () => {
      const mockAccount = {
        state: jest.fn().mockResolvedValue({ amount: '10500000000000000000000000' }),
      };

      const result = await getNEARBalance(mockAccount);

      expect(nearAPI.utils.format.formatNearAmount).toHaveBeenCalledWith(
        '10500000000000000000000000',
        2
      );
      expect(result).toEqual({
        yocto: '10500000000000000000000000',
        near: '10.50',
      });
    });
  });

  describe('getUSDCBalance', () => {
    it('returns formatted USDC balance', async () => {
      const mockAccount = {
        accountId: 'myapp.testnet',
        connection: {
          provider: {
            query: jest.fn().mockResolvedValue({
              result: Buffer.from(JSON.stringify('5000000')),
            }),
          },
        },
      };

      const result = await getUSDCBalance(mockAccount);

      const argsBase64 = Buffer.from(JSON.stringify({ account_id: 'myapp.testnet' })).toString('base64');
      expect(mockAccount.connection.provider.query).toHaveBeenCalledWith({
        request_type: 'call_function',
        account_id: 'usdc.fakes.testnet',
        method_name: 'ft_balance_of',
        args_base64: argsBase64,
        finality: 'final',
      });
      expect(result).toEqual({ raw: '5000000', usdc: '5.00' });
    });

    it('returns 0.00 when balance is zero', async () => {
      const mockAccount = {
        accountId: 'myapp.testnet',
        connection: {
          provider: {
            query: jest.fn().mockResolvedValue({
              result: Buffer.from(JSON.stringify('0')),
            }),
          },
        },
      };

      const result = await getUSDCBalance(mockAccount);
      expect(result).toEqual({ raw: '0', usdc: '0.00' });
    });
  });
});
