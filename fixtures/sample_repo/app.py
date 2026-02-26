# app.py – Main application entrypoint
from payment import PaymentProcessor
from auth import generate_token
from utils import log_event


def checkout(user_id, cart_total):
    """User checkout flow – calls process_payment."""
    token = generate_token()
    log_event("checkout_started", {"user": user_id})
    proc = PaymentProcessor()
    result = proc.process_payment(cart_total, user_id)
    return {"token": token, "payment": result}


def subscribe(user_id, plan_amount):
    """Subscription billing – also calls process_payment."""
    log_event("subscription_started", {"user": user_id})
    proc = PaymentProcessor(gateway="razorpay")
    return proc.process_payment(plan_amount, user_id, currency="INR")


def main():
    """Demo entrypoint."""
    result = checkout("user_42", 499.00)
    log_event("demo_complete", result)
    return result


if __name__ == "__main__":
    main()
