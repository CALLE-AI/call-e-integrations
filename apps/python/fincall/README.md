# FinCall

AI-powered financial operations phone agent for overdue invoice follow-up using CALL-E.

## What it does

FinCall helps finance teams prioritize overdue invoices and conduct structured payment follow-up calls.

The workflow is:

1. Load overdue invoices
2. Calculate collection priority
3. Select an invoice
4. Initiate an authorized CALL-E phone call
5. Extract payment status and expected payment date
6. Store the call outcome
7. Recommend the next finance action

## Features

- Multiple overdue invoices
- Collection prioritization
- CALL-E outbound phone calls
- Structured payment-status extraction
- Expected payment-date extraction
- Call evidence
- Persistent call history
- Recommended next actions
- Streamlit dashboard

## Setup

Install the dependencies:

```bash
pip install -r requirements.txt
```

Create a .env file:

```bash
CALLE_API_KEY=your_api_key
```

Run the application:

```bash
streamlit run app.py
```

## Credentials

The CALL-E API key must be provided through the `CALLE_API_KEY` environment variable.

Never commit API keys, credentials, or other secrets.

## Phone numbers

The example invoice data uses masked phone numbers.

For live testing, replace the example phone number with a phone number that you are authorized to call.

Do not use unauthorized or third-party phone numbers.

## Side effects

Live mode places a real outbound phone call through CALL-E.

A phone call is initiated only when the operator explicitly presses the call button.

Review the selected invoice and recipient before initiating a live call.

## Cancellation and follow-up

FinCall does not automatically initiate recurring calls.

If a call requires follow-up, the previous outcome is displayed so that the operator can decide what action to take.

Any additional call should be explicitly initiated by the operator.

## Preview / demo behavior

The invoice prioritization and dashboard workflow can be reviewed without placing a phone call.

Live phone execution occurs only when the operator explicitly initiates the CALL-E action.

## Safety

- Do not commit credentials or API keys.
- Use authorized phone numbers only.
- Example data uses masked phone numbers.
- Review call outcomes before taking consequential financial action.
- FinCall does not automatically make recurring collection calls.

## Project structure

```text
fincall/
├── app.py
├── fincall.py
├── requirements.txt
├── README.md
└── data/
    └── invoices.example.json
```
