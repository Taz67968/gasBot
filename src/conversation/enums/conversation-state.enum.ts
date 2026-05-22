/**
 * ConversationState
 * Defines the explicit finite state machine steps for the GasBot conversational flow.
 * Each state represents a distinct phase in the order placement process.
 */
export enum ConversationState {
  IDLE = 'IDLE',
  LANGUAGE_SELECT = 'LANGUAGE_SELECT',
  MAIN_MENU = 'MAIN_MENU',
  PRODUCT_SELECT = 'PRODUCT_SELECT',
  CONFIRM_PRODUCT = 'CONFIRM_PRODUCT',
  LOCATION_INPUT = 'LOCATION_INPUT',
  ORDER_SUMMARY = 'ORDER_SUMMARY',
  CASH_ACKNOWLEDGEMENT = 'CASH_ACKNOWLEDGEMENT',
}
