const { wrapNEAR, swapNEARtoUSDC } = require('../src/swap');

const WNEAR_USDC_POOL_ID = 54;

const mockAccount = { functionCall: jest.fn() };

describe('swap', () => {
  describe('wrapNEAR', () => {
    it('calls near_deposit on wrap.testnet with deposit amount', async () => {
      mockAccount.functionCall.mockResolvedValue({});

      const amountYocto = '1000000000000000000000000'; // 1 NEAR
      await wrapNEAR(mockAccount, amountYocto, 'wrap.testnet');

      expect(mockAccount.functionCall).toHaveBeenCalledWith({
        contractId: 'wrap.testnet',
        methodName: 'near_deposit',
        args: {},
        gas: '30000000000000',
        attachedDeposit: amountYocto,
      });
    });
  });

  describe('swapNEARtoUSDC', () => {
    it('calls ft_transfer_call on wrap.testnet with Ref Finance swap message', async () => {
      mockAccount.functionCall.mockResolvedValue({});

      const amountYocto = '1000000000000000000000000';
      await swapNEARtoUSDC(mockAccount, amountYocto, '0', {
        refFinance: 'ref-finance-101.testnet',
        wNear: 'wrap.testnet',
        usdcContract: 'usdc.fakes.testnet',
        wNearUsdcPoolId: WNEAR_USDC_POOL_ID,
      });

      expect(mockAccount.functionCall).toHaveBeenCalledWith({
        contractId: 'wrap.testnet',
        methodName: 'ft_transfer_call',
        args: {
          receiver_id: 'ref-finance-101.testnet',
          amount: amountYocto,
          msg: JSON.stringify({
            actions: [
              {
                pool_id: WNEAR_USDC_POOL_ID,
                token_in: 'wrap.testnet',
                token_out: 'usdc.fakes.testnet',
                amount_in: amountYocto,
                min_amount_out: '0',
              },
            ],
          }),
        },
        gas: '180000000000000',
        attachedDeposit: '1',
      });
    });

    it('passes minAmountOut correctly for slippage protection', async () => {
      mockAccount.functionCall.mockResolvedValue({});

      const amountYocto = '500000000000000000000000'; // 0.5 NEAR
      await swapNEARtoUSDC(mockAccount, amountYocto, '400000', {
        refFinance: 'ref-finance-101.testnet',
        wNear: 'wrap.testnet',
        usdcContract: 'usdc.fakes.testnet',
        wNearUsdcPoolId: WNEAR_USDC_POOL_ID,
      }); // min 0.4 USDC

      const call = mockAccount.functionCall.mock.calls[0][0];
      const msg = JSON.parse(call.args.msg);
      expect(msg.actions[0].min_amount_out).toBe('400000');
    });
  });
});
