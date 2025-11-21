## Calendar Integration Cheat Sheet

Use this document when wiring the frontend to the Google Calendar-aware backend. It summarizes what changed in the data model plus which endpoints need to be called for organizations and deals so that vendor calendars stay in sync.

---

### 1. What Changed
- `Organization` objects now contain a nullable `googleCalendarId` (the vendor’s Google Calendar email).
- `Deal` objects now track `googleCalendarEventId` (managed by the backend) and still rely on `eventDate` to determine when to sync to the vendor calendar.
- When Google Calendar sync is enabled server-side, deals that belong to an organization with `googleCalendarId` and have an `eventDate` will automatically create/update/delete all‑day events.

---

### 2. Organization Endpoints

#### Create Organization
- **POST** `/api/organizations`
- **Body snippet**
  ```json
  {
    "name": "Vendor Name",
    "category": "PHOTOGRAPHY",
    "ownerId": 12,
    "address": "Optional",
    "googleCalendarId": "vendor.calendar@example.com" // optional, email
  }
  ```
- **Response** includes the stored `googleCalendarId`.

#### Update Organization
- **PUT** `/api/organizations/{id}`
- Send the full payload (same shape as create) with the updated `googleCalendarId`.

#### Get/List Organizations
- **GET** `/api/organizations` (list) or `/api/organizations/{id}` (single)
- Responses now include `googleCalendarId` so you can display/edit it.

**Frontend guidance**
- Treat `googleCalendarId` as optional but validate using email pattern before sending.
- Clearing the field (empty string) removes calendar syncing for that vendor.

---

### 3. Deal Endpoints

#### Create Deal
- **POST** `/api/deals`
- **Body fields relevant to calendar**
  ```json
  {
    "name": "Sample Deal",
    "organizationId": 5,      // must belong to org with googleCalendarId to sync
    "eventDate": "2025-12-12",
    "eventType": "Wedding",   // optional, shows up in calendar description
    "venue": "The Plaza",     // optional, becomes event location
    "phoneNumber": "+1-555-1234" // optional, shown in description
  }
  ```
- No need to send `googleCalendarEventId`; backend manages it.

#### Update Deal Stage or Status
- **PUT** `/api/deals/{id}/stage`
- **PATCH** `/api/deals/{id}/status`
- Backend re-syncs the calendar entry whenever status changes (e.g., WON/LOST) or when `eventDate` changes via a future update endpoint.

#### Retrieve Deals
- Any `GET` variant (list, listByOrganization, etc.) returns `eventDate` plus the backend-managed `googleCalendarEventId`. The frontend usually ignores the event id, but it can be displayed for troubleshooting.

#### Delete Deal
- **DELETE** `/api/deals/{id}`
- Backend removes the linked Google Calendar event automatically.

**Frontend guidance**
- Ensure the deal form enforces an ISO date string (`YYYY-MM-DD`) for `eventDate`.
- Encourage users to select an organization that already has a `googleCalendarId`. Without it the calendar will not populate.

---

### 4. Calendar Configuration (FYI)
Although the frontend does not manage configuration, it helps to know the ops-level requirements:

```yaml
google:
  calendar:
    enabled: true
    application-name: Brideside CRM
    credentials-file: /path/to/service-account.json   # or credentials-json
    impersonated-user: vendor-admin@example.com       # optional
```

- Ops must share each vendor’s Google Calendar with the service account email so the backend can write events.
- If calendar sync is disabled server-side, `googleCalendarId` is simply stored and unused.

---

### 5. UX Suggestions
- When editing an organization, highlight that `googleCalendarId` should be the vendor calendar’s primary email (not just any contact email).
- On the deal creation form, show a badge or tooltip when the selected organization has calendar sync enabled so the user knows an event will appear automatically.
- Surface backend messages if a deal fails to create; the calendar integration itself never requires extra frontend calls.

---

Keep this file open in Cursor while wiring your forms—it contains everything needed to submit the right payloads and display the new fields. If additional endpoints are introduced (e.g., manual resync), append them here.


