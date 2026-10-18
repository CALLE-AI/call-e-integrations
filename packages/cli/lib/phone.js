const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const NANP_NXX_PATTERN = /^[2-9]\d{2}$/;

export const DESTINATION_PHONE_FORMAT_GUIDANCE =
  "Provide a valid E.164 destination number. This is a phone-number format problem, not an unsupported region.";

function formatDestinationPhoneError(phone) {
  const rendered = typeof phone === "string" ? phone : JSON.stringify(phone);
  return `--to-phone ${rendered} is a malformed or fictional number. ${DESTINATION_PHONE_FORMAT_GUIDANCE}`;
}

function isReservedNanpNpa(npa) {
  // N11 codes are service codes, not geographic area codes.
  if (npa[1] === "1" && npa[2] === "1") {
    return true;
  }
  // NANP NPA 555 is reserved/fictional. NXX 555 (for example +1 415 555 0123) is valid format.
  return npa === "555";
}

export function destinationPhoneFormatError(phone) {
  if (typeof phone !== "string" || !E164_PATTERN.test(phone)) {
    return formatDestinationPhoneError(phone);
  }

  if (phone.startsWith("+1")) {
    const national = phone.slice(2);
    if (national.length !== 10) {
      return formatDestinationPhoneError(phone);
    }

    const npa = national.slice(0, 3);
    const nxx = national.slice(3, 6);
    if (!NANP_NXX_PATTERN.test(npa) || !NANP_NXX_PATTERN.test(nxx) || isReservedNanpNpa(npa)) {
      return formatDestinationPhoneError(phone);
    }
  }

  return null;
}
