// Ref Finance testnet контракты
const REF_FINANCE = 'ref-finance-101.testnet';
const WNEAR = 'wrap.testnet';
const USDC = 'usdc.fakes.testnet';

// Pool ID для wNEAR/USDC на testnet (верифицирован 2026-05-11: usdc.fakes.testnet / wrap.testnet)
const WNEAR_USDC_POOL_ID = 54;

/**
 * Оборачивает NEAR в wNEAR (wrapped NEAR) — обязательный шаг перед свапом.
 * @param {Account} account
 * @param {string} amountYocto — сумма в yoctoNEAR (1 NEAR = 10^24 yoctoNEAR)
 */
async function wrapNEAR(account, amountYocto) {
  return account.functionCall({
    contractId: WNEAR,
    methodName: 'near_deposit',
    args: {},
    gas: '30000000000000',
    attachedDeposit: amountYocto,
  });
}

/**
 * Обменивает wNEAR → USDC через Ref Finance.
 * Вызывать ПОСЛЕ wrapNEAR.
 * @param {Account} account
 * @param {string} amountYocto — количество wNEAR для обмена (yoctoNEAR)
 * @param {string} minAmountOut — минимум USDC, иначе транзакция откатится (slippage защита)
 *                                Передавай '0' для тестов, для prod рассчитывай от spot price
 */
async function swapNEARtoUSDC(account, amountYocto, minAmountOut) {
  return account.functionCall({
    contractId: WNEAR,
    methodName: 'ft_transfer_call',
    args: {
      receiver_id: REF_FINANCE,
      amount: amountYocto,
      msg: JSON.stringify({
        actions: [
          {
            pool_id: WNEAR_USDC_POOL_ID,
            token_in: WNEAR,
            token_out: USDC,
            amount_in: amountYocto,
            min_amount_out: minAmountOut,
          },
        ],
      }),
    },
    gas: '180000000000000', // 180 TGas — свап требует больше газа
    attachedDeposit: '1',   // 1 yoctoNEAR — требование ft_transfer_call
  });
}

module.exports = { wrapNEAR, swapNEARtoUSDC, WNEAR_USDC_POOL_ID };
