import json
from datetime import date, datetime
from pathlib import Path

import streamlit as st

from fincall import FinCall


# ============================================================
# PAGE CONFIG
# ============================================================

st.set_page_config(
    page_title="FinCall",
    page_icon="📞",
    layout="wide",
)


# ============================================================
# CUSTOM CSS
# ============================================================

st.markdown(
    """
<style>
.fincall-title {
    font-size: 44px;
    font-weight: 700;
    margin-bottom: 0;
}

.fincall-subtitle {
    color: #9ca3af;
    font-size: 17px;
    margin-top: 4px;
}

.section-label {
    font-size: 13px;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
}

.priority-high {
    color: #ff6b6b;
    font-weight: 700;
}

.priority-medium {
    color: #f59e0b;
    font-weight: 700;
}

.priority-low {
    color: #22c55e;
    font-weight: 700;
}

.invoice-card {
    padding: 20px;
    border-radius: 14px;
    border: 1px solid #30363d;
    background: #161b22;
}

.history-card {
    padding: 18px;
    border-radius: 12px;
    border: 1px solid #30363d;
    background: #161b22;
    margin-top: 10px;
}

.next-action {
    padding: 18px;
    border-left: 4px solid #3b82f6;
    background: #111827;
    border-radius: 8px;
    margin-top: 18px;
}
</style>
""",
    unsafe_allow_html=True,
)


# ============================================================
# PATHS
# ============================================================

DATA_PATH = Path("data/invoices.example.json")
HISTORY_PATH = Path("data/call_history.json")


# ============================================================
# DATA FUNCTIONS
# ============================================================

def load_invoices():
    with open(DATA_PATH, "r", encoding="utf-8") as file:
        return json.load(file)


def load_call_history():
    if not HISTORY_PATH.exists():
        return {}

    try:
        with open(HISTORY_PATH, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception:
        return {}


def save_call_history(history):
    with open(HISTORY_PATH, "w", encoding="utf-8") as file:
        json.dump(history, file, indent=2)


def calculate_priority(invoice):
    """
    Calculate collection priority using:
    - Outstanding amount
    - Number of days overdue
    """

    due_date = datetime.strptime(
        invoice["due_date"],
        "%Y-%m-%d"
    ).date()

    today = date.today()

    days_overdue = max(
        0,
        (today - due_date).days
    )

    amount = float(invoice["amount"])

    # Normalize amount roughly to a 0-100 range.
    amount_score = min(
        100,
        (amount / 150000) * 100
    )

    # More overdue days = higher priority.
    overdue_score = min(
        100,
        days_overdue * 15
    )

    # Amount is weighted slightly more heavily.
    score = (
        amount_score * 0.6
        + overdue_score * 0.4
    )

    if score >= 65:
        priority = "HIGH"
    elif score >= 35:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    return score, priority, days_overdue


# ============================================================
# LOAD DATA
# ============================================================

try:
    invoices = load_invoices()
    call_history = load_call_history()

except Exception as error:
    st.error(f"Could not load application data: {error}")
    st.stop()


# ============================================================
# RANK INVOICES
# ============================================================

ranked_invoices = []

for invoice in invoices:

    score, priority, days_overdue = calculate_priority(
        invoice
    )

    invoice_copy = invoice.copy()

    invoice_copy["priority_score"] = score
    invoice_copy["priority"] = priority
    invoice_copy["days_overdue"] = days_overdue

    ranked_invoices.append(invoice_copy)


ranked_invoices.sort(
    key=lambda x: x["priority_score"],
    reverse=True
)


# ============================================================
# HEADER
# ============================================================

st.markdown(
    '<div class="fincall-title">📞 FinCall</div>',
    unsafe_allow_html=True,
)

st.markdown(
    '<div class="fincall-subtitle">'
    'AI-powered financial operations phone agent'
    '</div>',
    unsafe_allow_html=True,
)

st.divider()


# ============================================================
# TOP METRICS
# ============================================================

total_overdue = sum(
    invoice["amount"]
    for invoice in ranked_invoices
)

high_priority_count = sum(
    1
    for invoice in ranked_invoices
    if invoice["priority"] == "HIGH"
)

col1, col2, col3 = st.columns(3)

with col1:
    st.metric(
        "Overdue Invoices",
        len(ranked_invoices)
    )

with col2:
    st.metric(
        "Outstanding Amount",
        f"₹{total_overdue:,.0f}"
    )

with col3:
    st.metric(
        "High Priority",
        high_priority_count
    )


st.divider()


# ============================================================
# COLLECTION PRIORITY
# ============================================================

st.markdown(
    '<div class="section-label">'
    'COLLECTION PRIORITY'
    '</div>',
    unsafe_allow_html=True,
)

st.subheader("Who should be called first?")


for index, invoice in enumerate(ranked_invoices):

    priority = invoice["priority"]

    if priority == "HIGH":
        icon = "🔴"
        priority_class = "priority-high"

    elif priority == "MEDIUM":
        icon = "🟠"
        priority_class = "priority-medium"

    else:
        icon = "🟢"
        priority_class = "priority-low"

    # Show latest call outcome if available.
    history = call_history.get(
        invoice["invoice_id"],
        {}
    )

    last_status = history.get(
        "payment_status",
        "Not contacted"
    )

    if last_status != "Not contacted":
        last_status = last_status.replace(
            "_",
            " "
        ).title()

    st.markdown(
        f"""
**{icon} {invoice["customer"]}**  
Invoice `{invoice["invoice_id"]}` ·
₹{invoice["amount"]:,.0f} ·
{invoice["days_overdue"]} day(s) overdue ·
<span class="{priority_class}">{priority} PRIORITY</span>  

Last outcome: **{last_status}**
""",
        unsafe_allow_html=True,
    )

    if index < len(ranked_invoices) - 1:
        st.divider()


st.divider()


# ============================================================
# SELECT CUSTOMER
# ============================================================

st.markdown(
    '<div class="section-label">'
    'AI PAYMENT FOLLOW-UP'
    '</div>',
    unsafe_allow_html=True,
)

invoice_options = {
    f'{invoice["invoice_id"]} · {invoice["customer"]} · '
    f'₹{invoice["amount"]:,.0f}': invoice["invoice_id"]
    for invoice in ranked_invoices
}


selected_label = st.selectbox(
    "Select an invoice to contact",
    options=list(invoice_options.keys()),
)

selected_invoice_id = invoice_options[selected_label]

selected_invoice = next(
    invoice
    for invoice in ranked_invoices
    if invoice["invoice_id"] == selected_invoice_id
)


# ============================================================
# SELECTED INVOICE
# ============================================================

st.markdown(
    f"""
<div class="invoice-card">
    <div class="section-label">SELECTED INVOICE</div>
    <h3>{selected_invoice["customer"]}</h3>
    <p>
        Invoice {selected_invoice["invoice_id"]} ·
        Due {selected_invoice["due_date"]}
    </p>
    <h2>₹{selected_invoice["amount"]:,.0f}</h2>
    <p>
        {selected_invoice["days_overdue"]} day(s) overdue ·
        <b>{selected_invoice["priority"]} PRIORITY</b>
    </p>
</div>
""",
    unsafe_allow_html=True,
)


# ============================================================
# PREVIOUS CALL HISTORY
# ============================================================

previous_call = call_history.get(
    selected_invoice_id
)

if previous_call:

    st.write("")

    st.markdown(
        '<div class="section-label">'
        'PREVIOUS CALL'
        '</div>',
        unsafe_allow_html=True,
    )

    status = previous_call.get(
        "payment_status",
        "unknown"
    )

    status_display = status.replace(
        "_",
        " "
    ).title()

    expected_payment = previous_call.get(
        "expected_payment_date",
        "Unknown"
    )

    follow_up = previous_call.get(
        "follow_up_required",
        False
    )

    call_time = previous_call.get(
        "called_at",
        "Unknown"
    )

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric(
            "Payment Status",
            status_display
        )

    with col2:
        st.metric(
            "Expected Payment",
            expected_payment
        )

    with col3:
        st.metric(
            "Follow-up",
            "Required"
            if follow_up
            else "Not Required"
        )

    st.caption(
        f"Last contacted: {call_time}"
    )


st.write("")


# ============================================================
# CALL CUSTOMER
# ============================================================

if st.button(
    "📞  Start AI Payment Follow-up",
    type="primary",
    use_container_width=True,
):

    fincall = FinCall()

    with st.spinner(
        "CALL-E is calling the customer..."
    ):

        try:

            result = fincall.call_customer(
                selected_invoice_id
            )

            st.success(
                "Call completed successfully"
            )

            structured = result.get(
                "structured_result",
                {}
            )

            payment_status = structured.get(
                "payment_status",
                "unknown"
            )

            expected_date = structured.get(
                "expected_payment_date",
                "Unknown"
            )

            follow_up = structured.get(
                "follow_up_required",
                False
            )

            evidence = result.get(
                "evidence",
                []
            )

            # ====================================================
            # SAVE CALL HISTORY
            # ====================================================

            call_history[selected_invoice_id] = {
                "payment_status": payment_status,
                "expected_payment_date": expected_date,
                "follow_up_required": follow_up,
                "evidence": evidence,
                "called_at": datetime.now().strftime(
                    "%Y-%m-%d %H:%M:%S"
                )
            }

            save_call_history(call_history)

            # ====================================================
            # CALL OUTCOME
            # ====================================================

            st.divider()

            st.markdown(
                '<div class="section-label">'
                'CALL OUTCOME'
                '</div>',
                unsafe_allow_html=True,
            )

            col1, col2, col3 = st.columns(3)

            with col1:

                st.metric(
                    "Payment Status",
                    payment_status.replace(
                        "_",
                        " "
                    ).title(),
                )

            with col2:

                st.metric(
                    "Expected Payment",
                    expected_date,
                )

            with col3:

                st.metric(
                    "Follow-up",
                    "Required"
                    if follow_up
                    else "Not Required",
                )

            # ====================================================
            # AI EVIDENCE
            # ====================================================

            st.markdown(
                '<div class="section-label" '
                'style="margin-top:25px;">'
                'AI CALL EVIDENCE'
                '</div>',
                unsafe_allow_html=True,
            )

            if evidence:

                for item in evidence:

                    st.write(
                        "✓",
                        item
                    )

            else:

                st.write(
                    "No evidence returned."
                )

            # ====================================================
            # RECOMMENDED ACTION
            # ====================================================

            if payment_status == "payment_promised":

                next_action = (
                    "<b>Recommended next action</b>"
                    "<br><br>"
                    "Customer committed to payment. "
                    "Follow up after the promised payment "
                    "date if payment has not been confirmed."
                )

            elif payment_status == "delayed":

                next_action = (
                    "<b>Recommended next action</b>"
                    "<br><br>"
                    "Payment is delayed. "
                    "Schedule another follow-up and review "
                    "the customer's stated reason."
                )

            elif payment_status == "disputed":

                next_action = (
                    "<b>Recommended next action</b>"
                    "<br><br>"
                    "Customer disputed the invoice. "
                    "Route the case to the finance team "
                    "for manual review."
                )

            elif payment_status == "paid":

                next_action = (
                    "<b>Recommended next action</b>"
                    "<br><br>"
                    "Payment has been confirmed. "
                    "No further collection call is required."
                )

            else:

                next_action = (
                    "<b>Recommended next action</b>"
                    "<br><br>"
                    "Call outcome is inconclusive. "
                    "Schedule another attempt or manual review."
                )

            st.markdown(
                f"""
<div class="next-action">
{next_action}
</div>
""",
                unsafe_allow_html=True,
            )

            # ====================================================
            # REFRESH DATA
            # ====================================================

            st.info(
                "Call outcome saved to FinCall history."
            )

        except Exception as error:

            st.error(
                f"Call failed: {error}"
            )


# ============================================================
# FOOTER
# ============================================================

st.divider()

st.caption(
    "FinCall · AI-powered financial operations "
    "using CALL-E"
)