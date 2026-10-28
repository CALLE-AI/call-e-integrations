# Client preview and result integrity checks

These conservative client policies detect situations that cannot be interpreted safely or provide no usable result. They do not change the service contract or prove that the server will accept a request. The handwritten OpenAPI remains the original v0.1.0 subset; this revision did not revisit the official schema. Passing validation does not authorize submission.

## result_schema preview

First check the core structure: a closed object with at most 32 scalar properties. Then apply these semantic checks:

- Every name in `required` must exist in `properties`.
- Every `enum` value must match the property's declared string, boolean, integer, or number type. Booleans are not numbers. Integers permit mathematically integral JSON numbers such as 1.0; do not convert the string "1" to a number.
- This client policy rejects empty and duplicate enums. Numeric 1 and 1.0 are equal; true and 1 are distinct. Do not describe this policy as a restriction verified on the CALL-E server or claim that generic JSON Schema automatically rejects all these cases.
- A string property may explicitly include `unknown`; boolean/number/integer enums must not include a string for this purpose. Define the business meaning of unknown results in task.

These are preview decision rules, not a requirement for the host to run development test modules. The selected API path performs authorized business operations through direct HTTP and API Key.

## Evidence required for each operation

The permissive response schema allows the server to add fields. Passing it with `{}` does not establish usable evidence. Check the available fields against the intended operation:

| Operation | Required evidence |
| --- | --- |
| Save a create result | HTTP 202 and a nonempty resource `id`; 202 establishes acceptance, not connection or business success. |
| Read results | Resource `id`, execution `status`, and a recognized `result_status`; available requires an actual object result, and `{}` can be valid. |
| Read events | An array `data`, a nonempty `id` for every event, and an actually returned string/null `next_cursor`. A missing cursor field means pagination information is insufficient; retain the previously saved cursor. |

When required information is missing, a type is incorrect, or result_status is unknown, report "insufficient information," list the missing items, and preserve known facts. Do not invent default success states or create a new call to fill information gaps. Billing `call_id` cannot replace resource `id`.

Event pagination follows the [event contract](api-contract.md#events): retain the current cursor for an empty page, deduplicate by event ID, and do not concatenate intermediate ASR fragments into a final transcript. Use the actual contents of the Call's top-level transcript for the final conversation.

This revision verified only offline pure functions and fixtures. Actual Agent adherence requires separate evidence from isolated Agent and mock tool traces.
