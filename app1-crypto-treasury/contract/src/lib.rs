use near_sdk::{near, env, AccountId};
use near_sdk::store::UnorderedMap;

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum PaymentStatus {
    Locked,
    Released,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Payment {
    pub payment_id: String,
    pub amount_usdc: u128,
    pub status: PaymentStatus,
}

#[near(contract_state)]
pub struct EscrowContract {
    payments: UnorderedMap<String, Payment>,
    owner: AccountId,
}

impl Default for EscrowContract {
    fn default() -> Self {
        panic!("Contract must be initialized via new()")
    }
}

#[near]
impl EscrowContract {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            payments: UnorderedMap::new(b"p"),
            owner,
        }
    }

    pub fn lock_funds(&mut self, payment_id: String, amount_usdc: u128) {
        assert!(amount_usdc > 0, "Amount must be greater than 0");
        assert!(
            !self.payments.contains_key(&payment_id),
            "Payment ID already exists"
        );

        let payment = Payment {
            payment_id: payment_id.clone(),
            amount_usdc,
            status: PaymentStatus::Locked,
        };

        self.payments.insert(payment_id, payment);
    }

    pub fn release_funds(&mut self, payment_id: String) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only owner can release funds"
        );

        let mut payment = self
            .payments
            .get(&payment_id)
            .expect("Payment not found")
            .clone();

        assert!(
            payment.status == PaymentStatus::Locked,
            "Payment is not in LOCKED status"
        );

        payment.status = PaymentStatus::Released;
        self.payments.insert(payment_id, payment);
    }

    pub fn get_payment(&self, payment_id: String) -> Option<Payment> {
        self.payments.get(&payment_id).cloned()
    }

    pub fn get_all_payments(&self) -> Vec<Payment> {
        self.payments.values().cloned().collect()
    }
}

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

    // ---------- release_funds ----------

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

    #[test]
    #[should_panic(expected = "Only owner can release funds")]
    fn test_release_funds_non_owner_panics() {
        // owner = accounts(0), caller = accounts(1)
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let mut contract = EscrowContract::new(accounts(0));
        contract.lock_funds("pay_001".to_string(), 100_000_000);

        let context2 = get_context(accounts(1));
        testing_env!(context2.build());
        contract.release_funds("pay_001".to_string());
    }
}
