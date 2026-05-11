const GAS = '30000000000000'; // 30 TGas

/**
 * Блокирует USDC в эскроу-контракте.
 * @param {Account} account
 * @param {string} contractId
 * @param {string} paymentId
 * @param {number} amountUsdc  — сумма в минимальных единицах USDC (6 знаков)
 */
async function lockFunds(account, contractId, paymentId, amountUsdc) {
  return account.functionCall({
    contractId,
    methodName: 'lock_funds',
    args: { payment_id: paymentId, amount_usdc: amountUsdc },
    gas: GAS,
    attachedDeposit: '0',
  });
}

/**
 * Разблокирует USDC. Вызывать только после подтверждения от App 2.
 * @param {Account} account
 * @param {string} contractId
 * @param {string} paymentId
 */
async function releaseFunds(account, contractId, paymentId) {
  return account.functionCall({
    contractId,
    methodName: 'release_funds',
    args: { payment_id: paymentId },
    gas: GAS,
    attachedDeposit: '0',
  });
}

async function viewCall(account, contractId, methodName, args) {
  const argsBase64 = Buffer.from(JSON.stringify(args)).toString('base64');
  const result = await account.connection.provider.query({
    request_type: 'call_function',
    account_id: contractId,
    method_name: methodName,
    args_base64: argsBase64,
    finality: 'final',
  });
  return JSON.parse(Buffer.from(result.result).toString());
}

async function getPayment(account, contractId, paymentId) {
  return viewCall(account, contractId, 'get_payment', { payment_id: paymentId });
}

async function getAllPayments(account, contractId) {
  return viewCall(account, contractId, 'get_all_payments', {});
}

module.exports = { lockFunds, releaseFunds, getPayment, getAllPayments };
