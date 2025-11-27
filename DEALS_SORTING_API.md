# Deals Sorting API Documentation

This document describes the API endpoints needed for sorting deals in the frontend.

## Endpoint: GET /api/deals

### Query Parameters

The deals list endpoint should support the following query parameters for sorting:

#### Sorting Parameters

- `sort` (string, optional): Sort field and direction in the format `field,direction`
  - Format: `{field},{direction}`
  - Direction: `asc` (ascending) or `desc` (descending)
  - Default: `nextActivity,asc` (if not specified)

#### Supported Sort Fields

The following sort fields should be supported:

1. **nextActivity** (default)
   - Sort by the date/time of the next upcoming activity (activities that are not done)
   - If no next activity exists, deals should appear at the end (or beginning, depending on direction)
   - Field type: DateTime

2. **dealTitle** or **name**
   - Sort by deal name/title alphabetically
   - Field type: String

3. **dealValue** or **value**
   - Sort by deal value (monetary amount)
   - Field type: Number

4. **linkedPerson** or **personName**
   - Sort by the name of the linked person
   - Field type: String (person's name)

5. **linkedOrganization** or **organizationName**
   - Sort by the name of the linked organization
   - Field type: String (organization's name)

6. **expectedCloseDate** or **eventDate**
   - Sort by expected close date / event date
   - Field type: Date

7. **dealCreated** or **createdAt**
   - Sort by deal creation date/time
   - Field type: DateTime

8. **dealUpdateTime** or **updatedAt**
   - Sort by deal last update date/time
   - Field type: DateTime

9. **doneActivities** or **completedActivitiesCount**
   - Sort by count of completed/done activities
   - Field type: Number

10. **activitiesToDo** or **pendingActivitiesCount**
    - Sort by count of pending/not done activities
    - Field type: Number

11. **numberOfProducts** or **productsCount**
    - Sort by number of products (if products are associated with deals)
    - Field type: Number
    - Note: This may need to be implemented if products feature doesn't exist yet

12. **ownerName** or **personOwnerName**
    - Sort by the owner/manager name (person's owner)
    - Field type: String (owner's name)

### Example Requests

```
# Sort by deal update time (descending)
GET /api/deals?sort=updatedAt,desc

# Sort by deal value (ascending)
GET /api/deals?sort=value,asc

# Sort by next activity (ascending - default)
GET /api/deals?sort=nextActivity,asc

# Sort by linked person name (ascending)
GET /api/deals?sort=personName,asc

# Sort by done activities count (descending)
GET /api/deals?sort=completedActivitiesCount,desc
```

### Response Format

The response should remain the same as the current implementation - an array of Deal objects:

```json
[
  {
    "id": 1,
    "name": "Deal Name",
    "value": 10000,
    "personId": 123,
    "pipelineId": 456,
    "stageId": 789,
    "status": "IN_PROGRESS",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-02T00:00:00Z",
    ...
  }
]
```

## Implementation Notes

### For Backend Developers

1. **Next Activity Sorting**: This is the most complex sort field. You'll need to:
   - Join with the activities table
   - Filter for activities where `done = false`
   - Get the minimum `dueDate` or `date` for each deal
   - Sort by that date
   - Deals with no pending activities should be sorted to the end (or beginning) based on direction

2. **Activity Counts**: For `doneActivities` and `activitiesToDo`:
   - Join with activities table
   - Count activities where `done = true` for done activities
   - Count activities where `done = false` for activities to do
   - Sort by these counts

3. **Related Entity Sorting**: For `linkedPerson`, `linkedOrganization`, and `ownerName`:
   - Join with persons/organizations/users tables
   - Sort by the name field from the joined table

4. **Products Count**: If products are not yet implemented, you can either:
   - Return 0 for all deals
   - Skip this sort option until products are implemented

### For Frontend Developers

The frontend will:
1. Store the selected sort field and direction in state
2. Pass these as query parameters when calling the API
3. Update the UI to show the current sort selection
4. Provide a dropdown to select sort field and direction

## Sort Field Mapping

| Frontend Display | API Sort Field | Notes |
|-----------------|----------------|-------|
| Next activity | `nextActivity` | Default sort |
| Deal title | `name` or `dealTitle` | |
| Deal value | `value` or `dealValue` | |
| Linked person | `personName` or `linkedPerson` | |
| Linked organization | `organizationName` or `linkedOrganization` | |
| Expected close date | `eventDate` or `expectedCloseDate` | |
| Deal created | `createdAt` or `dealCreated` | |
| Deal update time | `updatedAt` or `dealUpdateTime` | |
| Done activities | `completedActivitiesCount` or `doneActivities` | |
| Activities to do | `pendingActivitiesCount` or `activitiesToDo` | |
| Number of products | `productsCount` or `numberOfProducts` | May need implementation |
| Owner name | `ownerName` or `personOwnerName` | |

## Error Handling

If an invalid sort field is provided, the API should:
- Return a 400 Bad Request error
- Include an error message indicating the invalid sort field
- Optionally, fall back to the default sort (`nextActivity,asc`)

## Testing Recommendations

Test the following scenarios:
1. All sort fields with ascending order
2. All sort fields with descending order
3. Invalid sort field (should return error)
4. Invalid sort direction (should return error or default to asc)
5. Sorting with null/empty values (should handle gracefully)
6. Next activity sort with deals that have no activities
7. Activity count sorts with deals that have no activities
8. Related entity sorts with deals that have no linked person/organization

