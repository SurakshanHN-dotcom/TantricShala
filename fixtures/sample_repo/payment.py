# payment.py – Payment processing module
from utils import log_event, sanitize
from auth import verify_token


class PaymentProcessor:
    """Core payment primitive – highest blast-radius class in the system."""

    def __init__(self, gateway="stripe"):
        self.gateway = gateway

    def process_payment(self, amount, user_id, currency="INR"):
        """Process a payment. Called by: checkout, subscriptions, refunds."""
        user_id = sanitize(user_id)
        verify_token(user_id)
        log_event("payment_started", {"amount": amount, "currency": currency})
        validated = self._validate_amount(amount)
        result = self._charge(validated, currency)
        log_event("payment_completed", result)
        return result

    def _validate_amount(self, amount):
        if not isinstance(amount, (int, float)):
            raise TypeError(f"amount must be numeric, got {type(amount)}")
        if amount <= 0:
            raise ValueError("Amount must be positive")
        return round(amount, 2)

    def _charge(self, amount, currency):
        return {
            "status": "ok",
            "amount": amount,
            "currency": currency,
            "gateway": self.gateway,
        }

    def refund(self, transaction_id, reason=""):
        log_event("refund_initiated", {"transaction_id": transaction_id})
        return {"status": "refunded", "transaction_id": transaction_id}
