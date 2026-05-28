async function wrapNEAR(account, amountYocto, wNear) {
  return account.functionCall({
    contractId: wNear,
    methodName: 'near_deposit',
    args: {},
    gas: '30000000000000',
    attachedDeposit: amountYocto,
  });
}

async function swapNEARtoUSDC(account, amountYocto, minAmountOut, { refFinance, wNear, usdcContract, wNearUsdcPoolId }) {
  return account.functionCall({
    contractId: wNear,
    methodName: 'ft_transfer_call',
    args: {
      receiver_id: refFinance,
      amount: amountYocto,
      msg: JSON.stringify({
        actions: [
          {
            pool_id: wNearUsdcPoolId,
            token_in: wNear,
            token_out: usdcContract,
            amount_in: amountYocto,
            min_amount_out: minAmountOut,
          },
        ],
      }),
    },
    gas: '180000000000000',
    attachedDeposit: '1',
  });
}

module.exports = { wrapNEAR, swapNEARtoUSDC };
