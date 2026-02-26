// mockData.ts – Static fixture data for Mock Mode (no AWS needed)
import type { GraphNode, GraphEdge, AuditResponse } from '../types';

export const MOCK_NODES: GraphNode[] = [
    { id: 'app.py::__module__', name: 'app.py', label: 'Module', file_path: 'app.py', line_start: 1, line_end: 32, version_id: 'v1', language: 'python' },
    { id: 'payment.py::__module__', name: 'payment.py', label: 'Module', file_path: 'payment.py', line_start: 1, line_end: 38, version_id: 'v1', language: 'python' },
    { id: 'auth.py::__module__', name: 'auth.py', label: 'Module', file_path: 'auth.py', line_start: 1, line_end: 20, version_id: 'v1', language: 'python' },
    { id: 'utils.py::__module__', name: 'utils.py', label: 'Module', file_path: 'utils.py', line_start: 1, line_end: 15, version_id: 'v1', language: 'python' },
    { id: 'payment.py::PaymentProcessor', name: 'PaymentProcessor', label: 'Class', file_path: 'payment.py', line_start: 5, line_end: 38, version_id: 'v1', language: 'python' },
    { id: 'payment.py::process_payment', name: 'process_payment', label: 'Function', file_path: 'payment.py', line_start: 15, line_end: 24, version_id: 'v1', language: 'python' },
    { id: 'payment.py::_charge', name: '_charge', label: 'Function', file_path: 'payment.py', line_start: 29, line_end: 35, version_id: 'v1', language: 'python' },
    { id: 'payment.py::refund', name: 'refund', label: 'Function', file_path: 'payment.py', line_start: 37, line_end: 38, version_id: 'v1', language: 'python' },
    { id: 'auth.py::verify_token', name: 'verify_token', label: 'Function', file_path: 'auth.py', line_start: 6, line_end: 10, version_id: 'v1', language: 'python' },
    { id: 'auth.py::generate_token', name: 'generate_token', label: 'Function', file_path: 'auth.py', line_start: 13, line_end: 15, version_id: 'v1', language: 'python' },
    { id: 'auth.py::hash_user_id', name: 'hash_user_id', label: 'Function', file_path: 'auth.py', line_start: 18, line_end: 20, version_id: 'v1', language: 'python' },
    { id: 'utils.py::log_event', name: 'log_event', label: 'Function', file_path: 'utils.py', line_start: 4, line_end: 9, version_id: 'v1', language: 'python' },
    { id: 'utils.py::sanitize', name: 'sanitize', label: 'Function', file_path: 'utils.py', line_start: 12, line_end: 14, version_id: 'v1', language: 'python' },
    { id: 'utils.py::format_currency', name: 'format_currency', label: 'Function', file_path: 'utils.py', line_start: 17, line_end: 20, version_id: 'v1', language: 'python' },
    { id: 'app.py::checkout', name: 'checkout', label: 'Function', file_path: 'app.py', line_start: 7, line_end: 14, version_id: 'v1', language: 'python' },
    { id: 'app.py::subscribe', name: 'subscribe', label: 'Function', file_path: 'app.py', line_start: 17, line_end: 21, version_id: 'v1', language: 'python' },
    { id: 'app.py::main', name: 'main', label: 'Function', file_path: 'app.py', line_start: 24, line_end: 28, version_id: 'v1', language: 'python' },
];

export const MOCK_EDGES: GraphEdge[] = [
    { source_id: 'payment.py::__module__', source_name: 'payment.py', relationship: 'DEFINES', target_id: 'payment.py::PaymentProcessor', target_name: 'PaymentProcessor', file_path: 'payment.py', line: 5 },
    { source_id: 'payment.py::PaymentProcessor', source_name: 'PaymentProcessor', relationship: 'DEFINES', target_id: 'payment.py::process_payment', target_name: 'process_payment', file_path: 'payment.py', line: 15 },
    { source_id: 'payment.py::PaymentProcessor', source_name: 'PaymentProcessor', relationship: 'DEFINES', target_id: 'payment.py::_charge', target_name: '_charge', file_path: 'payment.py', line: 29 },
    { source_id: 'payment.py::PaymentProcessor', source_name: 'PaymentProcessor', relationship: 'DEFINES', target_id: 'payment.py::refund', target_name: 'refund', file_path: 'payment.py', line: 37 },
    { source_id: 'payment.py::process_payment', source_name: 'process_payment', relationship: 'CALLS', target_id: 'auth.py::verify_token', target_name: 'verify_token', file_path: 'payment.py', line: 17 },
    { source_id: 'payment.py::process_payment', source_name: 'process_payment', relationship: 'CALLS', target_id: 'utils.py::log_event', target_name: 'log_event', file_path: 'payment.py', line: 18 },
    { source_id: 'payment.py::process_payment', source_name: 'process_payment', relationship: 'CALLS', target_id: 'utils.py::sanitize', target_name: 'sanitize', file_path: 'payment.py', line: 16 },
    { source_id: 'payment.py::process_payment', source_name: 'process_payment', relationship: 'CALLS', target_id: 'payment.py::_charge', target_name: '_charge', file_path: 'payment.py', line: 20 },
    { source_id: 'app.py::checkout', source_name: 'checkout', relationship: 'CALLS', target_id: 'payment.py::process_payment', target_name: 'process_payment', file_path: 'app.py', line: 11 },
    { source_id: 'app.py::checkout', source_name: 'checkout', relationship: 'CALLS', target_id: 'auth.py::generate_token', target_name: 'generate_token', file_path: 'app.py', line: 9 },
    { source_id: 'app.py::subscribe', source_name: 'subscribe', relationship: 'CALLS', target_id: 'payment.py::process_payment', target_name: 'process_payment', file_path: 'app.py', line: 20 },
    { source_id: 'app.py::main', source_name: 'main', relationship: 'CALLS', target_id: 'app.py::checkout', target_name: 'checkout', file_path: 'app.py', line: 25 },
    { source_id: 'auth.py::__module__', source_name: 'auth.py', relationship: 'DEFINES', target_id: 'auth.py::verify_token', target_name: 'verify_token', file_path: 'auth.py', line: 6 },
    { source_id: 'auth.py::__module__', source_name: 'auth.py', relationship: 'DEFINES', target_id: 'auth.py::generate_token', target_name: 'generate_token', file_path: 'auth.py', line: 13 },
    { source_id: 'utils.py::__module__', source_name: 'utils.py', relationship: 'DEFINES', target_id: 'utils.py::log_event', target_name: 'log_event', file_path: 'utils.py', line: 4 },
    { source_id: 'utils.py::__module__', source_name: 'utils.py', relationship: 'DEFINES', target_id: 'utils.py::sanitize', target_name: 'sanitize', file_path: 'utils.py', line: 12 },
];

export const MOCK_AUDIT: AuditResponse = {
    audit: {
        regression_risk: 9,
        architectural_debt: 5,
        cognitive_load: 6,
        risk_level: 'CRITICAL',
        summary: 'Deleting process_payment will cause immediate runtime failures in checkout and subscribe — both call it without null guards. This is a core payment primitive with 4 direct dependents across 2 files. Regression risk is critical.',
        affected_paths: ['app.py', 'payment.py', 'auth.py', 'utils.py'],
        key_concerns: [
            'app.py::checkout calls process_payment with no fallback (line 11)',
            'app.py::subscribe calls process_payment with no fallback (line 20)',
            'utils.py::sanitize and auth.py::verify_token become unreachable from payment path',
            'No deprecation wrapper or migration path defined for callers',
        ],
    },
    blast_radius_summary: {
        changed_nodes: 1,
        affected_nodes: 6,
        total_edges: 8,
        max_hop_distance: 3,
        symbols_queried: ['process_payment'],
    },
    version_id: 'v1',
};

export const TOXIC_DIFF = `--- a/payment.py
+++ b/payment.py
@@ -15,10 +15,0 @@
-    def process_payment(self, amount, user_id, currency="INR"):
-        """Process a payment. Called by: checkout, subscriptions, refunds."""
-        user_id = sanitize(user_id)
-        verify_token(user_id)
-        log_event("payment_started", {"amount": amount, "currency": currency})
-        validated = self._validate_amount(amount)
-        result = self._charge(validated, currency)
-        log_event("payment_completed", result)
-        return result
-`;
