// Messages sent from the content script to the extension (side panel listens).
export const SELECT_MESSAGE = "xray:select";

export interface SelectMessage {
  type: typeof SELECT_MESSAGE;
  source: string | null; // data-source of the nearest tagged ancestor, e.g. "src/pages/Checkout.tsx:52"
  component: string | null; // data-component of that element
  url: string;
}
