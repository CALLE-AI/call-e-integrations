# CALL-E core HTTP contract

Reviewed on 2026-10-13. Scope: Calls v2 and read-only Goals v1, not the complete Developer API. See the official [Calls API Reference](https://docs.heycall-e.com/api-reference/calls) for more detailed fields.

## Endpoints

| Method | Path | Purpose | Side effects |
| --- | --- | --- | --- |
| GET | /v1/goals?limit=1 | Minimal access check | Read |
| GET | /v1/goals | List published Goals visible to the current owner | Read |
| GET | /v1/goals/{goal_id} | Read the specified published interface | Read |
| POST | /v2/calls | Immediately create one call | May place a real call |
| GET | /v2/calls/{call_id} | Query Call status, results, and transcript | Read |
| GET | /v2/calls/{call_id}/events | Query a JSON page of persisted events | Read |
| POST | /v2/calls/{call_id}/cancel | Attempt cancellation before provider submission | State change |

Every path requires an API Key. The Goals list accepts `limit` from 1 to 100; read pagination values from `next_cursor` and pass the next page's query parameter as `after`. Do not derive a cursor from a Goal ID. An empty list does not mean authentication failed; never blindly select and execute the first Goal.

## Example create request

This example is for preparation only. It contains an explicit, non-dialable placeholder and must not be sent unchanged.

```json
{
  "phone": "<AUTHORIZED_E164_PHONE>",
  "task": "Use English. Identify yourself as an AI assistant making an authorized connection test. Ask whether the recipient can hear you clearly, allow a brief reply, and politely end the call. Do not ask for personal or financial information. Set heard_test to yes only for an explicit confirmation, no only for an explicit negative answer, and unknown when there is no clear answer. Provide a brief factual summary; do not infer an answer from silence.",
  "result_schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "heard_test": {"type": "string", "enum": ["yes", "no", "unknown"]},
      "summary": {"type": "string"}
    },
    "required": ["heard_test", "summary"]
  },
  "metadata": {"test_case": "skill-api-smoke-v1"}
}
```

This package defines the test script; it is not a verbatim official example. The user may change the language. Check regional coverage, lines, and supported languages against the actual account and official Regions documentation. Do not silently change the requested call language because the conversation uses Chinese.

Every intentional new call needs a new logical operation record and idempotency key; `metadata.test_case` is not an idempotency mechanism. Fields such as region and locale omitted from the original body must remain omitted in recovery requests.

## Responses and identifiers

A successful create is supported by HTTP 202 and the actual response. Save `id`, the API resource identifier. The separate top-level `call_id` is a Billing correlation identifier and may be null; it must not replace the resource ID.

The bundled OpenAPI uses permissive response objects describing only reviewed core fields. It does not incorrectly require every illustrative field or invent real account responses.

The optional `duration` field is aligned with the user-supplied service candidate
reviewed on 2026-10-30: a non-negative number of seconds or null, sourced from
recorded BillSec facts. Preserve zero and fractional seconds. It is null before
terminal execution or while duration data is unavailable, and can populate on a
later read independently of `result_status`. Missing fields from older service
versions remain unavailable. This source review does not establish deployment
or a live response containing the field.

`result_status` determines whether to keep waiting. `pending` can coexist with completed execution; an `available` result may be `{}`; `unavailable` may have both result=null and error=null; `not_applicable` covers situations with no applicable business result. Do not replace explicit status checks with truthiness checks such as `if result`.

## Events

GET events supports `limit` (1-100, server default 50) and `cursor`. Use the returned `next_cursor` to read existing pages. After the final page, retain the last returned event's `id` as the cursor for later polling. An empty page must not clear a saved cursor. Event IDs belong to an individual Call; deduplicate by ID.

Events are JSON pages, not SSE. `call.asr` may contain partial or revised recognition fragments. Prefer the Call's top-level transcript for the final conversation; do not simply concatenate all recognition events.

## Error decisions

| Situation | Skill action |
| --- | --- |
| 401 / 403 | Check credentials/permissions and stop blind retries. |
| 400 result_schema_invalid | This is an explicit input rejection; correct the schema before resubmitting. |
| 422 input_incomplete | Show missing_inputs and obtain the missing facts; this request did not create a Call. |
| 422 unsupported_region / unsupported_language | Check and correct the user's intended settings against the supported range; do not silently change region/language. |
| 409 + creation_in_progress | Preserve the body/key and retry a bounded number of times after backoff. |
| Other idempotency_conflict | Recover the original body/identity first; do not automatically change the key. |
| 429 / 503 / network timeout / unexpected response | Follow the actual error and retry guidance; preserve the original body/key for uncertain creation and do not infer that no call was placed. |
| cancel returns call_cannot_cancel | Do not claim cancellation succeeded or the call hung up. |

Calls v2 recovery rules do not apply to legacy `/v1/calls` or MCP tools.
