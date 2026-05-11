const { lockFunds, releaseFunds, getPayment, getAllPayments } = require('../src/escrow');

const mockAccount = {
  functionCall: jest.fn(),
  viewFunction: jest.fn(),
  connection: {
    provider: {
      query: jest.fn(),
    },
  },
};

const CONTRACT_ID = 'escrow.myapp.testnet';

describe('escrow', () => {
  describe('lockFunds', () => {
    it('calls lock_funds on contract with correct args', async () => {
      mockAccount.functionCall.mockResolvedValue({});

      await lockFunds(mockAccount, CONTRACT_ID, 'pay_001', 100_000_000);

      expect(mockAccount.functionCall).toHaveBeenCalledWith({
        contractId: CONTRACT_ID,
        methodName: 'lock_funds',
        args: { payment_id: 'pay_001', amount_usdc: 100_000_000 },
        gas: '30000000000000',
        attachedDeposit: '0',
      });
    });
  });

  describe('releaseFunds', () => {
    it('calls release_funds on contract with correct args', async () => {
      mockAccount.functionCall.mockResolvedValue({});

      await releaseFunds(mockAccount, CONTRACT_ID, 'pay_001');

      expect(mockAccount.functionCall).toHaveBeenCalledWith({
        contractId: CONTRACT_ID,
        methodName: 'release_funds',
        args: { payment_id: 'pay_001' },
        gas: '30000000000000',
        attachedDeposit: '0',
      });
    });
  });

  describe('getPayment', () => {
    it('calls get_payment view function and returns result', async () => {
      const mockPayment = { payment_id: 'pay_001', amount_usdc: 100_000_000, status: 'Locked' };
      mockAccount.connection.provider.query.mockResolvedValue({
        result: Buffer.from(JSON.stringify(mockPayment)),
      });

      const result = await getPayment(mockAccount, CONTRACT_ID, 'pay_001');

      const argsBase64 = Buffer.from(JSON.stringify({ payment_id: 'pay_001' })).toString('base64');
      expect(mockAccount.connection.provider.query).toHaveBeenCalledWith({
        request_type: 'call_function',
        account_id: CONTRACT_ID,
        method_name: 'get_payment',
        args_base64: argsBase64,
        finality: 'final',
      });
      expect(result).toEqual(mockPayment);
    });

    it('returns null when payment not found', async () => {
      mockAccount.connection.provider.query.mockResolvedValue({
        result: Buffer.from(JSON.stringify(null)),
      });

      const result = await getPayment(mockAccount, CONTRACT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAllPayments', () => {
    it('calls get_all_payments and returns array', async () => {
      const mockPayments = [
        { payment_id: 'pay_001', amount_usdc: 100_000_000, status: 'Locked' },
        { payment_id: 'pay_002', amount_usdc: 200_000_000, status: 'Released' },
      ];
      mockAccount.connection.provider.query.mockResolvedValue({
        result: Buffer.from(JSON.stringify(mockPayments)),
      });

      const result = await getAllPayments(mockAccount, CONTRACT_ID);

      const argsBase64 = Buffer.from(JSON.stringify({})).toString('base64');
      expect(mockAccount.connection.provider.query).toHaveBeenCalledWith({
        request_type: 'call_function',
        account_id: CONTRACT_ID,
        method_name: 'get_all_payments',
        args_base64: argsBase64,
        finality: 'final',
      });
      expect(result).toEqual(mockPayments);
    });
  });
});
