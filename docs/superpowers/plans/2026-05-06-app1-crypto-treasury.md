# App 1: Crypto Treasury — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js/Express API that manages NEAR/USDC funds using a Rust escrow smart contract deployed on NEAR Testnet, with NEAR→USDC swaps via Ref Finance.

**Architecture:** A Rust smart contract on NEAR Testnet acts as a payment state machine (lock/release/query). A Node.js/Express backend uses near-api-js to manage the NEAR wallet, execute swaps via Ref Finance, call the contract, and expose a REST API consumed by App 2. The contract is a state tracker — it records payment statuses while the backend handles actual NEAR/USDC operations.

**Tech Stack:** Rust + near-sdk 4.1.1, Node.js 18+, Express 4.18, near-api-js 2.1.4, Jest 29, supertest, NEAR Testnet, Ref Finance Testnet

---

## Prerequisites

Install before starting:

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# NEAR CLI
npm install -g near-cli

# Node.js 18+ (check: node --version)
```

---

## File Map

```
app1-crypto-treasury/
├── contract/
│   ├── Cargo.toml               — near-sdk dependency, wasm build config
│   └── src/lib.rs               — EscrowContract: lock_funds, release_funds, get_payment, get_all_payments
│
└── backend/
    ├── package.json             — deps: express, near-api-js, dotenv; devDeps: jest, supertest
    ├── .env.example             — template for NEAR credentials (committed)
    ├── .env                     — actual credentials (NOT committed)
    ├── .gitignore               — node_modules/, .env
    ├── src/
    │   ├── config.js            — loads .env, exports config object, validateConfig()
    │   ├── wallet.js            — loadAccount(), getNEARBalance()
    │   ├── swap.js              — wrapNEAR(), swapNEARtoUSDC()
    │   ├── escrow.js            — lockFunds(), releaseFunds(), getPayment(), getAllPayments()
    │   └── index.js             — Express app + 5 API routes, exports app + initAccount
    └── tests/
        ├── wallet.test.js
        ├── swap.test.js
        ├── escrow.test.js
        └── api.test.js
```

---

## PHASE 1: RUST SMART CONTRACT

---

### Task 1: Contract — Project Setup

**Files:**
- Create: `app1-crypto-treasury/contract/Cargo.toml`
- Create: `app1-crypto-treasury/contract/src/lib.rs` (scaffold)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p app1-crypto-treasury/contract/src
cd app1-crypto-treasury
git init
```

- [ ] **Step 2: Create `contract/Cargo.toml`**

```toml
[package]
name = "escrow"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
near-sdk = "4.1.1"

[profile.release]
codegen-units = 1
opt-level = "z"
lto = true
debug = false
panic = "abort"
overflow-checks = true
```

- [ ] **Step 3: Create scaffold `contract/src/lib.rs`**

```rust
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{near_bindgen, PanicOnDefault};

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct EscrowContract {}

#[near_bindgen]
impl EscrowContract {
    #[init]
    pub fn new() -> Self {
        Self {}
    }
}
```

- [ ] **Step 4: Verify scaffold compiles**

```bash
cd contract
cargo build
```

Expected: Compiles with warnings, no errors.

- [ ] **Step 5: Commit**

```bash
git add contract/
git commit -m "feat: scaffold Rust escrow contract"
```

---

### Task 2: Contract — Data Structures + lock_funds + get_payment

**Files:**
- Modify: `contract/src/lib.rs`

- [ ] **Step 1: Write failing tests** (add at bottom of `contract/src/lib.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn get_context(predecessor: near_sdk::AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    #[test]
    fn test_lock_funds_creates_locked_payment() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let mut contract = EscrowContract::new(accounts(0));

        contract.lock_funds("pay_001".to_string(), 100_000_000);

        let payment = contract.get_payment("pay_001".to_string()).unwrap();
        assert_eq!(payment.status, PaymentStatus::Locked);
        assert_eq!(payment.amount_usdc, 100_000_000);
        assert_eq!(payment.payment_id, "pay_001");
    }

    #[test]
    #[should_panic(expected = "Payment ID already exists")]
    fn test_lock_funds_duplicate_id_panics() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let mut contract = EscrowContract::new(accounts(0));

        contract.lock_funds("pay_001".to_string(), 100_000_000);
        contract.lock_funds("pay_001".to_string(), 50_000_000);
    }

    #[test]
    #[should_panic(expected = "Amount must be greater than 0")]
    fn test_lock_funds_zero_amount_panics() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let mut contract = EscrowContract::new(accounts(0));

        contract.lock_funds("pay_001".to_string(), 0);
    }

    #[test]
    fn test_get_payment_returns_none_for_unknown_id() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let contract = EscrowContract::new(accounts(0));

        assert!(contract.get_payment("nonexistent".to_string()).is_none());
    }
}
```

- [ ] **Step 2: Run to verify they fail**

```bash
cargo test
```

Expected: FAIL — `PaymentStatus not found`, `method lock_funds not found`

- [ ] **Step 3: Replace `contract/src/lib.rs` with full implementation**

```rust
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{near_bindgen, AccountId, BorshStorageKey, PanicOnDefault};

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, PartialEq, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub enum PaymentStatus {
    Locked,
    Released,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct Payment {
    pub payment_id: String,
    pub amount_usdc: u128,
    pub status: PaymentStatus,
}

#[derive(BorshStorageKey, BorshSerialize)]
enum StorageKey {
    Payments,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct EscrowContract {
    payments: UnorderedMap<String, Payment>,
    owner: AccountId,
}

#[near_bindgen]
impl EscrowContract {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            payments: UnorderedMap::new(StorageKey::Payments),
            owner,
        }
    }

    pub fn lock_funds(&mut self, payment_id: String, amount_usdc: u128) {
        assert!(
            self.payments.get(&payment_id).is_none(),
            "Payment ID already exists"
        );
        assert!(amount_usdc > 0, "Amount must be greater than 0");

        let payment = Payment {
            payment_id: payment_id.clone(),
            amount_usdc,
            status: PaymentStatus::Locked,
        };
        self.payments.insert(&payment_id, &payment);
    }

    pub fn get_payment(&self, payment_id: String) -> Option<Payment> {
        self.payments.get(&payment_id)
    }

    pub fn get_all_payments(&self) -> Vec<Payment> {
        self.payments.values_as_vector().to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    #[test]
    fn test_lock_funds_creates_locked_payment() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let mut contract = EscrowContract::new(accounts(0));

        contract.lock_funds("pay_001".to_string(), 100_000_000);

        let payment = contract.get_payment("pay_001".to_string()).unwrap();
        assert_eq!(payment.status, PaymentStatus::Locked);
        assert_eq!(payment.amount_usdc, 100_000_000);
        assert_eq!(payment.payment_id, "pay_001");
    }

    #[test]
    #[should_panic(expected = "Payment ID already exists")]
    fn test_lock_funds_duplicate_id_panics() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let mut contract = EscrowContract::new(accounts(0));

        contract.lock_funds("pay_001".to_string(), 100_000_000);
        contract.lock_funds("pay_001".to_string(), 50_000_000);
    }

    #[test]
    #[should_panic(expected = "Amount must be greater than 0")]
    fn test_lock_funds_zero_amount_panics() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let mut contract = EscrowContract::new(accounts(0));

        contract.lock_funds("pay_001".to_string(), 0);
    }

    #[test]
    fn test_get_payment_returns_none_for_unknown_id() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let contract = EscrowContract::new(accounts(0));

        assert!(contract.get_payment("nonexistent".to_string()).is_none());
    }

    #[test]
    fn test_get_all_payments_returns_all() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let mut contract = EscrowContract::new(accounts(0));

        contract.lock_funds("pay_001".to_string(), 100_000_000);
        contract.lock_funds("pay_002".to_string(), 200_000_000);

        let all = contract.get_all_payments();
        assert_eq!(all.len(), 2);
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cargo test
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add contract/src/lib.rs
git commit -m "feat: add lock_funds, get_payment, get_all_payments to escrow contract"
```

---

### Task 3: Contract — release_funds

**Files:**
- Modify: `contract/src/lib.rs`

- [ ] **Step 1: Add failing tests** (inside the `tests` module, after the existing tests)

```rust
    #[test]
    fn test_release_funds_changes_status_to_released() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let mut contract = EscrowContract::new(accounts(0));

        contract.lock_funds("pay_001".to_string(), 100_000_000);
        contract.release_funds("pay_001".to_string());

        let payment = contract.get_payment("pay_001".to_string()).unwrap();
        assert_eq!(payment.status, PaymentStatus::Released);
    }

    #[test]
    #[should_panic(expected = "Payment not found")]
    fn test_release_funds_unknown_id_panics() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let mut contract = EscrowContract::new(accounts(0));

        contract.release_funds("nonexistent".to_string());
    }

    #[test]
    #[should_panic(expected = "Payment is not in LOCKED status")]
    fn test_release_funds_double_release_panics() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let mut contract = EscrowContract::new(accounts(0));

        contract.lock_funds("pay_001".to_string(), 100_000_000);
        contract.release_funds("pay_001".to_string());
        contract.release_funds("pay_001".to_string());
    }
```

- [ ] **Step 2: Run to verify they fail**

```bash
cargo test
```

Expected: FAIL — `method release_funds not found`

- [ ] **Step 3: Add `release_funds` to the `impl EscrowContract` block** (after `get_all_payments`)

```rust
    pub fn release_funds(&mut self, payment_id: String) {
        let mut payment = self
            .payments
            .get(&payment_id)
            .expect("Payment not found");

        assert!(
            payment.status == PaymentStatus::Locked,
            "Payment is not in LOCKED status"
        );

        payment.status = PaymentStatus::Released;
        self.payments.insert(&payment_id, &payment);
    }
```

- [ ] **Step 4: Run all tests**

```bash
cargo test
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add contract/src/lib.rs
git commit -m "feat: add release_funds to escrow contract"
```

---

### Task 4: Contract — Build WASM + Deploy to Testnet

**Files:**
- No source changes — build and deploy only.

- [ ] **Step 1: Login to NEAR Testnet**

```bash
near login
```

Expected: Browser opens → login/create account → terminal shows `Logged in as yourname.testnet`

- [ ] **Step 2: Create a sub-account for the contract**

```bash
near create-account escrow.yourname.testnet --masterAccount yourname.testnet --initialBalance 5
```

Expected: `Account escrow.yourname.testnet for network "testnet" was created.`

Replace `yourname` with your actual testnet account name throughout this plan.

- [ ] **Step 3: Build WASM**

```bash
cd contract
cargo build --target wasm32-unknown-unknown --release
```

Expected: `Finished release [optimized] target(s)` — creates `target/wasm32-unknown-unknown/release/escrow.wasm`

- [ ] **Step 4: Deploy with initialization**

```bash
near deploy --accountId escrow.yourname.testnet \
  --wasmFile target/wasm32-unknown-unknown/release/escrow.wasm \
  --initFunction new \
  --initArgs '{"owner": "yourname.testnet"}'
```

Expected: `Done deploying and initializing escrow.yourname.testnet`

- [ ] **Step 5: Verify deployment**

```bash
near view escrow.yourname.testnet get_payment '{"payment_id": "test"}'
```

Expected: `null`

- [ ] **Step 6: Commit**

```bash
git add contract/
git commit -m "feat: escrow contract deployed to testnet"
```

---

## PHASE 2: NODE.JS BACKEND

---

### Task 5: Backend — Project Setup

**Files:**
- Create: `backend/package.json`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`
- Create: `backend/src/config.js`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p app1-crypto-treasury/backend/src app1-crypto-treasury/backend/tests
cd app1-crypto-treasury/backend
```

- [ ] **Step 2: Create `backend/package.json`**

```json
{
  "name": "app1-crypto-treasury",
  "version": "1.0.0",
  "scripts": {
    "start": "node src/index.js",
    "test": "jest"
  },
  "dependencies": {
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "near-api-js": "^2.1.4"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.4"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.js"]
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 4: Create `backend/.env.example`**

```bash
NEAR_ACCOUNT_ID=yourname.testnet
NEAR_PRIVATE_KEY=ed25519:YOUR_PRIVATE_KEY_HERE
NEAR_CONTRACT_ID=escrow.yourname.testnet
NEAR_NETWORK=testnet
PORT=3000
```

- [ ] **Step 5: Create `backend/.gitignore`**

```
node_modules/
.env
```

- [ ] **Step 6: Create `backend/src/config.js`**

```javascript
require('dotenv').config();

const config = {
  accountId: process.env.NEAR_ACCOUNT_ID,
  privateKey: process.env.NEAR_PRIVATE_KEY,
  contractId: process.env.NEAR_CONTRACT_ID,
  networkId: process.env.NEAR_NETWORK || 'testnet',
  nodeUrl: 'https://rpc.testnet.near.org',
  port: parseInt(process.env.PORT || '3000', 10),
};

function validateConfig() {
  const required = ['accountId', 'privateKey', 'contractId'];
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required env var for: ${key}`);
    }
  }
}

module.exports = { config, validateConfig };
```

- [ ] **Step 7: Create `.env` from example and fill in real values**

```bash
cp .env.example .env
```

Get your private key:
```bash
# On Windows Git Bash:
cat ~/.near-credentials/testnet/yourname.testnet.json
# Copy the value of "private_key"
```

Edit `.env` and paste in your actual `NEAR_ACCOUNT_ID`, `NEAR_PRIVATE_KEY`, `NEAR_CONTRACT_ID`.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/.env.example backend/.gitignore backend/src/config.js
git commit -m "feat: scaffold Node.js backend project"
```

---

### Task 6: Backend — wallet.js

**Files:**
- Create: `backend/tests/wallet.test.js`
- Create: `backend/src/wallet.js`

- [ ] **Step 1: Create `backend/tests/wallet.test.js`**

```javascript
const { loadAccount, getNEARBalance } = require('../src/wallet');

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
  afterEach(() => jest.clearAllMocks());

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
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest tests/wallet.test.js
```

Expected: FAIL — `Cannot find module '../src/wallet'`

- [ ] **Step 3: Create `backend/src/wallet.js`**

```javascript
const nearAPI = require('near-api-js');

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

async function getNEARBalance(account) {
  const state = await account.state();
  const near = nearAPI.utils.format.formatNearAmount(state.amount, 2);
  return { yocto: state.amount, near };
}

module.exports = { loadAccount, getNEARBalance };
```

- [ ] **Step 4: Run tests**

```bash
npx jest tests/wallet.test.js
```

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/wallet.js backend/tests/wallet.test.js
git commit -m "feat: add wallet module"
```

---

### Task 7: Backend — escrow.js

**Files:**
- Create: `backend/tests/escrow.test.js`
- Create: `backend/src/escrow.js`

- [ ] **Step 1: Create `backend/tests/escrow.test.js`**

```javascript
const { lockFunds, releaseFunds, getPayment, getAllPayments } = require('../src/escrow');

const mockAccount = {
  functionCall: jest.fn(),
  viewFunction: jest.fn(),
};

const CONTRACT_ID = 'escrow.myapp.testnet';

describe('escrow', () => {
  afterEach(() => jest.clearAllMocks());

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
      mockAccount.viewFunction.mockResolvedValue(mockPayment);

      const result = await getPayment(mockAccount, CONTRACT_ID, 'pay_001');

      expect(mockAccount.viewFunction).toHaveBeenCalledWith(
        CONTRACT_ID,
        'get_payment',
        { payment_id: 'pay_001' }
      );
      expect(result).toEqual(mockPayment);
    });

    it('returns null when payment not found', async () => {
      mockAccount.viewFunction.mockResolvedValue(null);

      const result = await getPayment(mockAccount, CONTRACT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAllPayments', () => {
    it('calls get_all_payments view function and returns array', async () => {
      const mockPayments = [
        { payment_id: 'pay_001', amount_usdc: 100_000_000, status: 'Locked' },
        { payment_id: 'pay_002', amount_usdc: 200_000_000, status: 'Released' },
      ];
      mockAccount.viewFunction.mockResolvedValue(mockPayments);

      const result = await getAllPayments(mockAccount, CONTRACT_ID);

      expect(mockAccount.viewFunction).toHaveBeenCalledWith(
        CONTRACT_ID,
        'get_all_payments',
        {}
      );
      expect(result).toEqual(mockPayments);
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest tests/escrow.test.js
```

Expected: FAIL — `Cannot find module '../src/escrow'`

- [ ] **Step 3: Create `backend/src/escrow.js`**

```javascript
const GAS = '30000000000000'; // 30 TGas

async function lockFunds(account, contractId, paymentId, amountUsdc) {
  return account.functionCall({
    contractId,
    methodName: 'lock_funds',
    args: { payment_id: paymentId, amount_usdc: amountUsdc },
    gas: GAS,
    attachedDeposit: '0',
  });
}

async function releaseFunds(account, contractId, paymentId) {
  return account.functionCall({
    contractId,
    methodName: 'release_funds',
    args: { payment_id: paymentId },
    gas: GAS,
    attachedDeposit: '0',
  });
}

async function getPayment(account, contractId, paymentId) {
  return account.viewFunction(contractId, 'get_payment', { payment_id: paymentId });
}

async function getAllPayments(account, contractId) {
  return account.viewFunction(contractId, 'get_all_payments', {});
}

module.exports = { lockFunds, releaseFunds, getPayment, getAllPayments };
```

- [ ] **Step 4: Run tests**

```bash
npx jest tests/escrow.test.js
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/escrow.js backend/tests/escrow.test.js
git commit -m "feat: add escrow module"
```

---

### Task 8: Backend — swap.js

**Files:**
- Create: `backend/tests/swap.test.js`
- Create: `backend/src/swap.js`

- [ ] **Step 1: Create `backend/tests/swap.test.js`**

```javascript
const { wrapNEAR, swapNEARtoUSDC } = require('../src/swap');

const mockAccount = { functionCall: jest.fn() };

describe('swap', () => {
  afterEach(() => jest.clearAllMocks());

  describe('wrapNEAR', () => {
    it('calls near_deposit on wrap.testnet with deposit amount', async () => {
      mockAccount.functionCall.mockResolvedValue({});

      const amountYocto = '1000000000000000000000000';
      await wrapNEAR(mockAccount, amountYocto);

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
      await swapNEARtoUSDC(mockAccount, amountYocto, '0');

      expect(mockAccount.functionCall).toHaveBeenCalledWith({
        contractId: 'wrap.testnet',
        methodName: 'ft_transfer_call',
        args: {
          receiver_id: 'ref-finance-101.testnet',
          amount: amountYocto,
          msg: JSON.stringify({
            actions: [
              {
                pool_id: 2,
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
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest tests/swap.test.js
```

Expected: FAIL — `Cannot find module '../src/swap'`

- [ ] **Step 3: Create `backend/src/swap.js`**

```javascript
// Ref Finance testnet contracts
const REF_FINANCE = 'ref-finance-101.testnet';
const WNEAR = 'wrap.testnet';
const USDC = 'usdc.fakes.testnet';
// Pool ID for wNEAR/USDC on testnet — verify at https://testnet.ref.finance if swap fails
const WNEAR_USDC_POOL_ID = 2;

async function wrapNEAR(account, amountYocto) {
  return account.functionCall({
    contractId: WNEAR,
    methodName: 'near_deposit',
    args: {},
    gas: '30000000000000',
    attachedDeposit: amountYocto,
  });
}

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
    gas: '180000000000000',
    attachedDeposit: '1',
  });
}

module.exports = { wrapNEAR, swapNEARtoUSDC };
```

- [ ] **Step 4: Run tests**

```bash
npx jest tests/swap.test.js
```

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/swap.js backend/tests/swap.test.js
git commit -m "feat: add swap module for NEAR→USDC via Ref Finance"
```

---

### Task 9: Backend — index.js (Express API)

**Files:**
- Create: `backend/tests/api.test.js`
- Create: `backend/src/index.js`

- [ ] **Step 1: Create `backend/tests/api.test.js`**

```javascript
const request = require('supertest');

jest.mock('../src/wallet', () => ({
  loadAccount: jest.fn(),
  getNEARBalance: jest.fn(),
}));
jest.mock('../src/swap', () => ({
  wrapNEAR: jest.fn(),
  swapNEARtoUSDC: jest.fn(),
}));
jest.mock('../src/escrow', () => ({
  lockFunds: jest.fn(),
  releaseFunds: jest.fn(),
  getPayment: jest.fn(),
  getAllPayments: jest.fn(),
}));
jest.mock('../src/config', () => ({
  config: {
    accountId: 'myapp.testnet',
    privateKey: 'ed25519:fakekey',
    contractId: 'escrow.myapp.testnet',
    networkId: 'testnet',
    nodeUrl: 'https://rpc.testnet.near.org',
    port: 3000,
  },
  validateConfig: jest.fn(),
}));
jest.mock('near-api-js', () => ({
  utils: { format: { parseNearAmount: jest.fn().mockReturnValue('1000000000000000000000000') } },
}));

const { loadAccount, getNEARBalance } = require('../src/wallet');
const { wrapNEAR, swapNEARtoUSDC } = require('../src/swap');
const { lockFunds, releaseFunds, getPayment, getAllPayments } = require('../src/escrow');

let app;

beforeAll(async () => {
  loadAccount.mockResolvedValue({});
  app = require('../src/index');
  await app.initAccount();
});

afterEach(() => jest.clearAllMocks());

describe('GET /api/balance', () => {
  it('returns NEAR balance', async () => {
    getNEARBalance.mockResolvedValue({ near: '10.50', yocto: '10500000000000000000000000' });

    const res = await request(app).get('/api/balance');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ near: '10.50', yocto: '10500000000000000000000000' });
  });
});

describe('POST /api/swap', () => {
  it('wraps NEAR and swaps to USDC', async () => {
    wrapNEAR.mockResolvedValue({});
    swapNEARtoUSDC.mockResolvedValue({});

    const res = await request(app)
      .post('/api/swap')
      .send({ amountNEAR: '1', minAmountOut: '0' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(wrapNEAR).toHaveBeenCalled();
    expect(swapNEARtoUSDC).toHaveBeenCalled();
  });

  it('returns 400 if amountNEAR is missing', async () => {
    const res = await request(app).post('/api/swap').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/lock', () => {
  it('locks funds in escrow contract', async () => {
    lockFunds.mockResolvedValue({});

    const res = await request(app)
      .post('/api/lock')
      .send({ paymentId: 'pay_001', amountUsdc: 100000000 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, paymentId: 'pay_001' });
    expect(lockFunds).toHaveBeenCalledWith(
      expect.anything(),
      'escrow.myapp.testnet',
      'pay_001',
      100000000
    );
  });

  it('returns 400 if paymentId or amountUsdc is missing', async () => {
    const res = await request(app).post('/api/lock').send({ paymentId: 'pay_001' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/release', () => {
  it('releases funds from escrow contract', async () => {
    releaseFunds.mockResolvedValue({});

    const res = await request(app)
      .post('/api/release')
      .send({ paymentId: 'pay_001' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, paymentId: 'pay_001' });
  });

  it('returns 400 if paymentId is missing', async () => {
    const res = await request(app).post('/api/release').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/payments', () => {
  it('returns all payments', async () => {
    const mockPayments = [
      { payment_id: 'pay_001', amount_usdc: 100000000, status: 'Locked' },
    ];
    getAllPayments.mockResolvedValue(mockPayments);

    const res = await request(app).get('/api/payments');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockPayments);
  });
});

describe('GET /api/payments/:id', () => {
  it('returns payment when found', async () => {
    const mockPayment = { payment_id: 'pay_001', amount_usdc: 100000000, status: 'Locked' };
    getPayment.mockResolvedValue(mockPayment);

    const res = await request(app).get('/api/payments/pay_001');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockPayment);
  });

  it('returns 404 when payment not found', async () => {
    getPayment.mockResolvedValue(null);

    const res = await request(app).get('/api/payments/unknown');

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest tests/api.test.js
```

Expected: FAIL — `Cannot find module '../src/index'`

- [ ] **Step 3: Create `backend/src/index.js`**

```javascript
const express = require('express');
const nearAPI = require('near-api-js');
const { config, validateConfig } = require('./config');
const { loadAccount, getNEARBalance } = require('./wallet');
const { wrapNEAR, swapNEARtoUSDC } = require('./swap');
const { lockFunds, releaseFunds, getPayment, getAllPayments } = require('./escrow');

validateConfig();

const app = express();
app.use(express.json());

let account;

async function initAccount() {
  account = await loadAccount(config);
}

app.get('/api/balance', async (req, res) => {
  try {
    const balance = await getNEARBalance(account);
    res.json(balance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/swap', async (req, res) => {
  const { amountNEAR, minAmountOut = '0' } = req.body;
  if (!amountNEAR) return res.status(400).json({ error: 'amountNEAR is required' });

  try {
    const amountYocto = nearAPI.utils.format.parseNearAmount(amountNEAR);
    await wrapNEAR(account, amountYocto);
    await swapNEARtoUSDC(account, amountYocto, minAmountOut);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/lock', async (req, res) => {
  const { paymentId, amountUsdc } = req.body;
  if (!paymentId || amountUsdc == null) {
    return res.status(400).json({ error: 'paymentId and amountUsdc are required' });
  }

  try {
    await lockFunds(account, config.contractId, paymentId, amountUsdc);
    res.json({ success: true, paymentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/release', async (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId) return res.status(400).json({ error: 'paymentId is required' });

  try {
    await releaseFunds(account, config.contractId, paymentId);
    res.json({ success: true, paymentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payments', async (req, res) => {
  try {
    const payments = await getAllPayments(account, config.contractId);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payments/:id', async (req, res) => {
  try {
    const payment = await getPayment(account, config.contractId, req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  initAccount().then(() => {
    app.listen(config.port, () => {
      console.log(`App 1 Crypto Treasury running on port ${config.port}`);
    });
  });
}

module.exports = app;
module.exports.initAccount = initAccount;
```

- [ ] **Step 4: Run all tests**

```bash
npx jest
```

Expected: All tests pass (13+ tests total).

- [ ] **Step 5: Commit**

```bash
git add backend/src/index.js backend/tests/api.test.js
git commit -m "feat: add Express API with all 5 endpoints"
```

---

### Task 10: Integration Test — Full Flow on Testnet

**Files:**
- No new files — manual curl test against live testnet.

- [ ] **Step 1: Start the server**

```bash
cd backend
npm start
```

Expected: `App 1 Crypto Treasury running on port 3000`

- [ ] **Step 2: Test GET /api/balance**

```bash
curl http://localhost:3000/api/balance
```

Expected: `{"yocto":"...","near":"5.00"}` — your testnet NEAR balance.

- [ ] **Step 3: Test POST /api/swap (convert 0.1 NEAR → USDC)**

```bash
curl -X POST http://localhost:3000/api/swap \
  -H "Content-Type: application/json" \
  -d '{"amountNEAR": "0.1", "minAmountOut": "0"}'
```

Expected: `{"success":true}`

If you get a swap error, verify the pool ID at `https://testnet.ref.finance` and update `WNEAR_USDC_POOL_ID` in `backend/src/swap.js`.

- [ ] **Step 4: Test POST /api/lock**

```bash
curl -X POST http://localhost:3000/api/lock \
  -H "Content-Type: application/json" \
  -d '{"paymentId": "pay_001", "amountUsdc": 100000}'
```

Expected: `{"success":true,"paymentId":"pay_001"}`

- [ ] **Step 5: Test GET /api/payments/pay_001**

```bash
curl http://localhost:3000/api/payments/pay_001
```

Expected: `{"payment_id":"pay_001","amount_usdc":100000,"status":"Locked"}`

- [ ] **Step 6: Test GET /api/payments**

```bash
curl http://localhost:3000/api/payments
```

Expected: `[{"payment_id":"pay_001","amount_usdc":100000,"status":"Locked"}]`

- [ ] **Step 7: Test POST /api/release**

```bash
curl -X POST http://localhost:3000/api/release \
  -H "Content-Type: application/json" \
  -d '{"paymentId": "pay_001"}'
```

Expected: `{"success":true,"paymentId":"pay_001"}`

- [ ] **Step 8: Verify status changed to Released**

```bash
curl http://localhost:3000/api/payments/pay_001
```

Expected: `{"payment_id":"pay_001","amount_usdc":100000,"status":"Released"}`

- [ ] **Step 9: Final commit**

```bash
git add .
git commit -m "feat: App 1 Crypto Treasury MVP complete"
```

---

## Self-Review

### Spec Coverage

| Spec requirement | Implemented in |
|-----------------|----------------|
| Wallet Manager — get balance | Task 6 (wallet.js) |
| Swap Module — NEAR→USDC via Ref Finance | Task 8 (swap.js) |
| Escrow Contract — lock/release/get | Tasks 2-3 (contract), Task 7 (escrow.js) |
| REST API — GET /api/balance | Task 9 (index.js) |
| REST API — POST /api/swap | Task 9 (index.js) |
| REST API — POST /api/lock | Task 9 (index.js) |
| REST API — POST /api/release | Task 9 (index.js) |
| REST API — GET /api/payments (history) | Task 9 (index.js) |
| NEAR Testnet deployment | Task 4 |
| `.env` configuration | Task 5 |

### Known Gaps (for future iterations)

- **USDC balance in GET /api/balance:** Spec mentions NEAR and USDC balance. Currently only NEAR is returned. To add USDC, call `ft_balance_of` on `usdc.fakes.testnet` via `viewFunction`.
- **App 2 auth on /api/release:** No authentication. Any caller can release funds. Add API key middleware before moving to production.
- **Ref Finance pool_id:** `WNEAR_USDC_POOL_ID = 2` is a best guess for testnet. Verify at `https://testnet.ref.finance` if the swap step fails.
