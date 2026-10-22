import type { CaseRecord, Client, CourtOrder } from "./types";

// Plain-language client updates built ONLY from advocate-approved order data.
// Kannada text is template-based; the UI asks for a Kannada speaker to check it before sending.

function ddmmyyyy(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

export function clientUpdateEn(c: CaseRecord, o: CourtOrder, client: Client | null, office: string): string {
  const who = client ? `Dear ${client.name},` : "Dear client,";
  const what = o.adjourned ? `At the hearing${o.orderDate ? ` on ${ddmmyyyy(o.orderDate)}` : ""}, the court adjourned the matter${o.stage ? ` for ${o.stage.toLowerCase()}` : ""}.` : `The court passed an order${o.orderDate ? ` on ${ddmmyyyy(o.orderDate)}` : ""}${o.stage ? ` (stage: ${o.stage.toLowerCase()})` : ""}.`;
  const next = o.nextHearingDate && o.nextHearingConfirmed ? `The next hearing is on ${ddmmyyyy(o.nextHearingDate)}.` : "The next hearing date is not yet confirmed; we will tell you as soon as it is.";
  return `${who} an update on your case ${c.number}${c.title ? ` (${c.title})` : ""}. ${what} ${next} Please call the office if you have any questions. – ${office}`;
}

export function clientUpdateKn(c: CaseRecord, o: CourtOrder, client: Client | null, office: string): string {
  const who = client ? `ನಮಸ್ಕಾರ ${client.name},` : "ನಮಸ್ಕಾರ,";
  const what = o.adjourned ? "ನ್ಯಾಯಾಲಯವು ವಿಚಾರಣೆಯನ್ನು ಮುಂದೂಡಿದೆ." : "ನ್ಯಾಯಾಲಯವು ಆದೇಶ ಹೊರಡಿಸಿದೆ.";
  const next = o.nextHearingDate && o.nextHearingConfirmed ? `ಮುಂದಿನ ವಿಚಾರಣೆ ${ddmmyyyy(o.nextHearingDate)} ರಂದು ನಡೆಯಲಿದೆ.` : "ಮುಂದಿನ ವಿಚಾರಣೆಯ ದಿನಾಂಕ ಇನ್ನೂ ಖಚಿತವಾಗಿಲ್ಲ; ಖಚಿತವಾದ ತಕ್ಷಣ ತಿಳಿಸುತ್ತೇವೆ.";
  return `${who} ನಿಮ್ಮ ಪ್ರಕರಣ ${c.number} ಕುರಿತು ಮಾಹಿತಿ: ${what} ${next} ಯಾವುದೇ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ ದಯವಿಟ್ಟು ಕಚೇರಿಗೆ ಕರೆ ಮಾಡಿ. – ${office}`;
}

/** WhatsApp click-to-chat link. Opening it does NOT send or deliver anything. */
export function whatsappLink(phone: string | null, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const num = digits.length === 10 ? "91" + digits : digits;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
