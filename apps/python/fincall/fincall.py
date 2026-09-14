import json
import os
from pathlib import Path

from dotenv import load_dotenv
from calle import CalleClient


load_dotenv()


class FinCall:
    def __init__(self):
        api_key = os.getenv("CALLE_API_KEY")

        if not api_key:
            raise RuntimeError("CALLE_API_KEY not found in .env")

        self.client = CalleClient(api_key=api_key)

    def load_invoice(self, invoice_id: str):
        data_path = Path("data/invoices.json")

        with open(data_path, "r", encoding="utf-8") as f:
            invoices = json.load(f)

        for invoice in invoices:
            if invoice["invoice_id"] == invoice_id:
                return invoice

        raise ValueError(f"Invoice {invoice_id} not found")

    def call_customer(self, invoice_id: str):
        invoice = self.load_invoice(invoice_id)

        task = f"""
You are FinCall, an AI financial operations assistant.

Your goal is to follow up with a customer regarding an overdue invoice.

Customer:
{invoice["customer"]}

Contact:
{invoice["contact_name"]}

Invoice:
{invoice["invoice_id"]}

Outstanding amount:
{invoice["currency"]} {invoice["amount"]:,}

Original due date:
{invoice["due_date"]}

Call the customer at:
{invoice["phone"]}

Start politely.

Explain that you are calling regarding the outstanding invoice.

Ask whether they are aware of the outstanding payment.

Ask when they expect to make the payment.

If they cannot make the payment, politely ask for the reason
or expected timeline.

Do not pressure, threaten, or misrepresent anything.

The purpose of the call is to understand the payment status
and obtain a realistic expected payment date if possible.

Before ending the call, make sure you have gathered the
best available payment status.

Then end the call politely.
"""

        result = self.client.calls.create_and_wait(
            task=task,
            result_schema={
                "type": "object",
                "required": [
                    "payment_status",
                    "expected_payment_date",
                    "follow_up_required"
                ],
                "properties": {
                    "payment_status": {
                        "type": "string",
                        "enum": [
                            "paid",
                            "payment_promised",
                            "delayed",
                            "disputed",
                            "unknown"
                        ]
                    },
                    "expected_payment_date": {
                        "type": "string"
                    },
                    "reason": {
                        "type": "string"
                    },
                    "follow_up_required": {
                        "type": "boolean"
                    }
                }
            }
        )

        return result