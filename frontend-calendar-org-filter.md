## Calendar Page – Organization Filter (Frontend Integration)

This document explains how the **Calendar** page should fetch and use organizations in the organization filter, based on the logged-in user’s role (Category Manager, Sales, Presales, Admin).

---

### 1. Backend Endpoint to Use

For the **calendar page organization dropdown**, always use:

- **Method**: `GET`
- **URL**: `/api/organizations/accessible-for-current-user`
- **Auth**: Bearer token (user must be authenticated)

This endpoint returns only the organizations the current user is allowed to see, according to the role hierarchy.

---

### 2. Role-Based Behavior

The backend enforces the following rules:

- **ADMIN**
  - Sees **all organizations**.

- **CATEGORY_MANAGER**
  - Sees organizations owned by:
    - themselves
    - all **Sales** who report directly to them
    - all **Presales** who report directly to them
    - all **Presales** who report to those Sales (two-level hierarchy)

- **SALES**
  - Sees organizations owned by:
    - themselves
    - all **Presales** who report directly to them

- **PRESALES**
  - Sees organizations owned **only by themselves**.

No extra filtering is required on the frontend; just use the response as-is for the organization filter.

---

### 3. Response Shape

`GET /api/organizations/accessible-for-current-user` returns:

```json
{
  "success": true,
  "message": "Accessible organizations fetched",
  "data": [
    {
      "id": 1,
      "name": "Vendor ABC",
      "owner": {
        "id": 10,
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com",
        "role": "SALES"
      },
      "category": "PHOTOGRAPHY",
      "address": "Some address",
      "googleCalendarId": "vendor-calendar@example.com",
      "createdAt": "2024-01-01T12:00:00Z",
      "updatedAt": "2024-01-10T12:00:00Z"
    }
  ]
}
```

- **Important fields for the dropdown**:
  - `id`: organization ID (use as `value`)
  - `name`: organization name (use as main `label`)
  - Optionally show owner info: `owner.firstName` + `owner.lastName` and/or `owner.role`.

---

### 4. How to Use on the Calendar Page

- **On page load** (or when the calendar filter UI mounts):
  1. Call `GET /api/organizations/accessible-for-current-user` with the user’s auth token.
  2. Store the returned `data` array as the **options** for the organization filter.

- **Dropdown suggestion (pseudo-code)**:

```ts
type Organization = {
  id: number;
  name: string;
  owner?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  category: 'PHOTOGRAPHY' | 'MAKEUP' | 'PLANNING_AND_DECOR';
};

type OrgOption = {
  value: number;
  label: string;
  subtitle?: string;
};

function mapToOrgOptions(orgs: Organization[]): OrgOption[] {
  return orgs.map(org => {
    const ownerName = org.owner
      ? `${org.owner.firstName ?? ''} ${org.owner.lastName ?? ''}`.trim()
      : '';
    return {
      value: org.id,
      label: org.name,
      subtitle: ownerName ? `${ownerName} (${org.owner?.role ?? ''})` : undefined
    };
  });
}
```

- **When user selects an organization**:
  - Use the selected `organizationId` to call the calendar events endpoint:

    - `GET /api/calendar/vendor-events?organizationId={id}&from={ISO}&to={ISO}`

---

### 5. Summary for Frontend

- **Always** use `/api/organizations/accessible-for-current-user` to populate the organization dropdown on the calendar page.
- Trust the backend to filter organizations according to the user’s role (Admin, Category Manager, Sales, Presales).
- Pass the selected organization’s `id` as `organizationId` to `/api/calendar/vendor-events` to filter calendar events.

---

### 6. Ready-Made Prompt for Frontend Implementation

Use the following prompt (e.g. in your frontend editor or AI assistant) to implement or adjust the Calendar page filters:

```text
You are working on the Calendar page of a CRM frontend (React or similar).

Requirements:
- There is an authenticated backend with role-based access (ADMIN, CATEGORY_MANAGER, SALES, PRESALES).
- Each `Organization` has:
  - `id`, `name`, `category`, `owner`, `googleCalendarId`, etc.
  - `owner` is a `User` (Sales / Presales / Category Manager).
- Each `User` has:
  - `id`, `firstName`, `lastName`, `email`, `role` (ADMIN, CATEGORY_MANAGER, SALES, PRESALES)
  - optional `manager` (for Sales/Presales hierarchy).

Backend endpoints to use:
1) GET /api/users
   - Returns users filtered by hierarchy based on the logged-in user.
   - For a CATEGORY_MANAGER, it returns:
     - the Category Manager themself
     - all Sales and Presales under them (direct and via the manager chain).
   - Use this to populate the Sales/Presales user filter on the Calendar page.

2) GET /api/organizations/accessible-for-current-user
   - Returns organizations the current user can access.
   - For a CATEGORY_MANAGER, it returns organizations whose owner is:
     - the Category Manager
     - any Sales directly under them
     - any Presales under them or under those Sales.
   - For a Sales user, it returns orgs owned by:
     - that Sales user
     - their direct Presales.
   - For Presales, only orgs owned by that Presales user.
   - Use this list to populate the Organization filter on the Calendar page.

3) GET /api/calendar/vendor-events?organizationId={id}&from={ISO}&to={ISO}
   - Use the selected `organizationId` (from the dropdown) and date range to load calendar events.

Task:
- Implement or update the Calendar page to:
  - Fetch `/api/users` on load and show a dropdown for Sales/Presales (or generic "Assigned user") using the returned users.
  - Fetch `/api/organizations/accessible-for-current-user` on load and show a dropdown for organizations.
  - When the user changes the selected organization or date range, call `/api/calendar/vendor-events` with the appropriate query params.
  - Make sure the filters always respect the backend’s role-based access (no extra client-side role logic needed).

Deliverables:
- A React (or framework-appropriate) component for the Calendar page, including:
  - API calls for `/api/users`, `/api/organizations/accessible-for-current-user`, `/api/calendar/vendor-events`.
  - Types/interfaces for the response shapes.
  - A clean, user-friendly UI for:
    - Organization filter
    - User filter
    - Date range selection
  - Logic to refresh events whenever filters change.
```



