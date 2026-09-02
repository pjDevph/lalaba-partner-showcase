// src/data/tourContent.ts
// All tour scripts for the merchant app.
// Each tour = array of TourStep objects shown one at a time.
//
// `highlight` controls where the translucent "spotlight" window opens:
//   "top"    — upper portion of screen (header, KPIs, tabs, filter chips)
//   "middle" — centre of screen (main content list or grid)
//   "bottom" — lower portion (sticky bars, FABs, tab navigation)
//   "full"   — entire screen dimmed equally (intro / outro steps)
//
// `iconName` maps to a Feather-style SVG icon in TourOverlay.

export type TourId =
  | "dashboard"
  | "pos-terminal"
  | "pos-queue"
  | "pos-claim"
  | "sales"
  | "services"
  | "settings";

export type HighlightZone = "top" | "middle" | "bottom" | "full";

export interface TourStep {
  id: string;
  iconName: string;
  title: string;
  body: string;
  highlight: HighlightZone;
  tip?: string;
}

function s(id: string, iconName: string, title: string, body: string, highlight: HighlightZone, tip?: string): TourStep {
  return { id, iconName, title, body, highlight, tip };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOURS
// ─────────────────────────────────────────────────────────────────────────────

export const dashboardTour: TourStep[] = [
  s("dashboard-welcome",      "layout",       "Your Operations Dashboard", "This screen gives you a live snapshot of today's business — revenue, order count, and recent activity, all in one place.", "full"),
  s("dashboard-quickactions", "zap",          "Quick Actions",             "These four rows are shortcuts to the most common tasks: start a new POS order, open the queue, jump to services, or check sales. Tap any row to go there directly.", "top", "Quick Actions show at the top so they are always the first thing you see."),
  s("dashboard-revenue",      "trending-up",  "Today's Revenue",           "This card shows the total revenue and number of completed orders for today. The numbers update each time you navigate back to this tab.", "middle"),
  s("dashboard-activity",     "list",         "Recent Activity",           "Every action taken in the app — orders created, services updated, staff shifts — appears here in chronological order. Tap Settings then Activity Logs for the full filtered history.", "bottom"),
];

export const posTerminalTour: TourStep[] = [
  s("pos-terminal-welcome",  "shopping-bag", "POS Terminal",     "The POS has three tabs at the top: Terminal to create orders, Queue to track and advance them, and Claim to release completed orders to customers.", "full"),
  s("pos-terminal-customer", "user",         "Customer Details", "At the top of the form you can enter an optional customer name and phone number. Walk-in orders work without this — fill it in when you want the receipt to include a name.", "top"),
  s("pos-terminal-services", "grid",         "Service Tiles",    "Tap any tile to add that service to the current order. Use the + and — buttons on the tile to adjust quantity. Only services marked Active in your catalog appear here.", "middle", "Add more services or update prices in the Services tab."),
  s("pos-terminal-payment",  "credit-card",  "Payment Method",   "Below the service tiles, select CASH or GCash. For cash, enter the amount received and the app calculates the change. For GCash, show your QR code to the customer.", "middle"),
  s("pos-terminal-place",    "check-circle", "Place the Order",  "The sticky bar at the bottom shows your running total. Tap Review Order to confirm the items, then Place Order to create the ticket. The customer receives a 6-character claim code and the order appears in the Queue tab immediately.", "bottom", "The claim code is printed at the top of the order receipt."),
];

export const posQueueTour: TourStep[] = [
  s("pos-queue-welcome",  "layers",         "Order Queue",       "All active orders for your branch appear here in real time. Use this screen to track progress and move each order forward through the workflow.", "full"),
  s("pos-queue-filters",  "sliders",        "Filter by Status",  "The chips at the top let you filter orders by their current status — All, Created, Processing, or Ready for Pickup. Tap a chip to narrow the list.", "top", "Use the filter when the queue gets busy and you only want to see one status at a time."),
  s("pos-queue-status",   "chevrons-right", "Advance an Order",  "Each order card shows the current status and an Advance button. Tap Advance to move the order forward: Created to Processing, then Processing to Ready for Pickup.", "middle", "Status colours: amber for Created, blue for Processing, green for Ready."),
  s("pos-queue-cancel",   "x-circle",       "Cancel an Order",   "Tap the Cancel button on an order card to void it. You will be asked to choose a reason — this is required and helps you identify patterns over time.", "middle"),
];

export const posClaimTour: TourStep[] = [
  s("pos-claim-welcome", "tag",          "Claim Screen",         "When a customer comes to pick up their order, use this screen to verify and release it using the claim code they received when the order was placed.", "full"),
  s("pos-claim-code",    "hash",         "Enter the Claim Code", "Type the 6-character code into the boxes at the top of the screen. The matching order details load automatically once the code is recognised.", "top", "Tap the camera icon to scan the QR code on the customer's receipt instead of typing manually."),
  s("pos-claim-confirm", "check-circle", "Confirm and Release",  "Check that the order details match what the customer is collecting, then tap Claim Order. The order status changes to Claimed and is removed from the active queue.", "bottom"),
];

export const salesTour: TourStep[] = [
  s("sales-welcome",    "bar-chart",   "Sales Analytics",  "Track your revenue, order volume, and trends over time. Switch between Today, This Week, This Month, or a custom date range.", "full"),
  s("sales-daterange",  "calendar",    "Date Range Filter", "Tap the period chips at the top of the screen to change the time window. The chart and all totals below update instantly when you switch periods.", "top"),
  s("sales-chart",      "trending-up", "Revenue Chart",    "The bar chart shows daily revenue for the selected range. Each bar represents one day — taller bars mean higher revenue. Useful for spotting slow days or planning staffing.", "middle"),
  s("sales-export",     "upload",      "Export Your Data", "Tap the Export button to generate a CSV file of all orders in the selected period. Share it to email, Google Sheets, or any app on your device.", "bottom", "Exporting monthly is useful for bookkeeping and sharing data with an accountant."),
];

export const servicesTour: TourStep[] = [
  s("services-welcome", "package",      "Service Catalog",       "This is where you manage the laundry services your customers can order. Everything you add here appears as a tile on the POS Terminal for your staff to select.", "full"),
  s("services-add",     "plus-circle",  "Add a Service",         "Tap the + button in the top-right corner to create a new service. Give it a name such as Wash and Fold, set the price, and choose the pricing unit.", "top", "Price per kg is multiplied by the weight entered at the POS Terminal to calculate the line total."),
  s("services-toggle",  "toggle-right", "Activate or Deactivate","The toggle on each service card controls whether it appears on the POS Terminal. Deactivated services stay in your catalog but are hidden from staff during ordering.", "middle"),
  s("services-archive", "archive",      "Archive a Service",     "Tap a service card to expand it, then tap Archive to remove it from the catalog. Archived services can be recovered within 30 days. After that they are permanently deleted.", "middle", "Tap Show Archived at the top of the list to see and restore archived services."),
];

export const settingsTour: TourStep[] = [
  s("settings-welcome",  "settings",   "Settings",              "Everything about how your business runs is configured here — operating hours, staff access, branch details, and a full audit trail of all activity.", "full"),
  s("settings-hub",      "layout",     "Navigation Rows",       "Tap any row in this list to open that settings area. Each section opens as its own full screen with a back button to return here.", "middle"),
  s("settings-staff",    "users",      "Staff and Permissions", "Tap Staff and Permissions to add team members. Each person gets a name, a role, and a 4-digit PIN. Staff enter that PIN to start their shift at the POS Terminal.", "middle", "Roles control what actions each staff member can perform — Cashier, Manager, and so on."),
  s("settings-hours",    "clock",      "Operating Hours",       "Tap Operating Hours to set your open and close times for each day of the week. Toggle a day off if your shop is closed on that day.", "top"),
  s("settings-activity", "file-text",  "Activity Logs",         "Tap Activity Logs to see a full history of every action taken in the app — who created or cancelled an order, who changed a service, and when. Use the filters to narrow down by type.", "bottom"),
];

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const TOUR_REGISTRY: Record<TourId, TourStep[]> = {
  "dashboard":    dashboardTour,
  "pos-terminal": posTerminalTour,
  "pos-queue":    posQueueTour,
  "pos-claim":    posClaimTour,
  "sales":        salesTour,
  "services":     servicesTour,
  "settings":     settingsTour,
};

export const TOUR_LABELS: Record<TourId, string> = {
  "dashboard":    "Dashboard",
  "pos-terminal": "POS Terminal",
  "pos-queue":    "Order Queue",
  "pos-claim":    "Claim Screen",
  "sales":        "Sales Analytics",
  "services":     "Services",
  "settings":     "Settings",
};
