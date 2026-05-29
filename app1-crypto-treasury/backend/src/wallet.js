const nearAPI = require('near-api-js');

const USDC_DECIMALS = 6;

async function loadAccount(config) {
  const keyPair = nearAPI.KeyPair.fromString(config.privateKey);
  const keyStore = new nearAPI.keyStores.InMemoryKeyStore();
  await keyStore.setKey(config.networkId, config.accountId, keyPair);

  const near = await nearAPI.connect({
    networkId: config.networkId,
    keyStore,
    nodeUrl: config.nodeUrl,
  });

  return near.account(config.accountId);
}

/**
 * Returns the NEAR account balance.
 * @param {Account} account
 * @returns {Promise<{yocto: string, near: string}>}
 */
async function getNEARBalance(account) {
  const state = await account.state();
  const near = nearAPI.utils.format.formatNearAmount(state.amount, 2);
  return { yocto: state.amount, near };
}

async function getUSDCBalance(account, usdcContract) {
  const argsBase64 = Buffer.from(JSON.stringify({ account_id: account.accountId })).toString('base64');
  const result = await account.connection.provider.query({
    request_type: 'call_function',
    account_id: usdcContract,
    method_name: 'ft_balance_of',
    args_base64: argsBase64,
    finality: 'final',
  });
  const raw = JSON.parse(Buffer.from(result.result).toString());
  const usdc = (parseInt(raw, 10) / Math.pow(10, USDC_DECIMALS)).toFixed(2);
  return { raw, usdc };
}

module.exports = { loadAccount, getNEARBalance, getUSDCBalance };
