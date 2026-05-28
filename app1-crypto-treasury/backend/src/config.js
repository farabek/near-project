require('dotenv').config();

const TESTNET_DEFAULTS = {
  usdcContract: 'usdc.fakes.testnet',
  refFinance: 'ref-finance-101.testnet',
  wNear: 'wrap.testnet',
  wNearUsdcPoolId: 54,
};

const MAINNET_DEFAULTS = {
  usdcContract: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a',
  refFinance: 'v2.ref-finance.near',
  wNear: 'wrap.near',
  wNearUsdcPoolId: 4512,
};

const networkId = process.env.NEAR_NETWORK || 'testnet';
const networkDefaults = networkId === 'mainnet' ? MAINNET_DEFAULTS : TESTNET_DEFAULTS;

const config = {
  accountId: process.env.NEAR_ACCOUNT_ID,
  privateKey: process.env.NEAR_PRIVATE_KEY,
  contractId: process.env.NEAR_CONTRACT_ID,
  networkId,
  nodeUrl: networkId === 'mainnet' ? 'https://rpc.mainnet.near.org' : 'https://rpc.testnet.near.org',
  port: parseInt(process.env.PORT || '3000', 10),
  releaseApiKey: process.env.RELEASE_API_KEY,
  usdcContract: process.env.USDC_CONTRACT || networkDefaults.usdcContract,
  refFinance: process.env.REF_FINANCE || networkDefaults.refFinance,
  wNear: process.env.WNEAR || networkDefaults.wNear,
  wNearUsdcPoolId: parseInt(process.env.WNEAR_USDC_POOL_ID || String(networkDefaults.wNearUsdcPoolId), 10),
};

function validateConfig() {
  const required = ['accountId', 'privateKey', 'contractId', 'releaseApiKey'];
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required env var for: ${key}. Check your .env file.`);
    }
  }
}

module.exports = { config, validateConfig };
