# Custom Filters Routing Issue

## Problem

The endpoint `GET /api/persons/custom-filters` is being treated as `GET /api/persons/{id}` where `id = "custom-filters"`, causing the error:

```
Invalid parameter 'id' value: 'custom-filters'. Expected type: Long
```

## Root Cause

This is a **backend routing conflict**. The backend likely has route definitions in this order:

```java
@GetMapping("/{id}")  // This matches FIRST
public Person getPerson(@PathVariable Long id) { ... }

@GetMapping("/custom-filters")  // This never gets matched
public ... getCustomFilters() { ... }
```

When Spring Boot processes routes, it matches `/custom-filters` against `/{id}` first, and tries to convert "custom-filters" to a Long, which fails.

## Solution: Backend Route Ordering

The backend needs to **define specific routes BEFORE generic path variable routes**. Here's how to fix it:

### Option 1: Reorder Routes (Recommended)

```java
@RestController
@RequestMapping("/api/persons")
public class PersonController {
    
    // ✅ Specific routes FIRST (before {id})
    @GetMapping("/custom-filters")
    public ResponseEntity<Map<String, PersonFilterCondition[]>> getCustomFilters() {
        // ... implementation
    }
    
    @PostMapping("/custom-filters")
    public ResponseEntity<Void> saveCustomFilter(@RequestBody CustomFilterRequest request) {
        // ... implementation
    }
    
    @DeleteMapping("/custom-filters/{name}")
    public ResponseEntity<Void> deleteCustomFilter(@PathVariable String name) {
        // ... implementation
    }
    
    @GetMapping("/labels")
    public ResponseEntity<List<PersonLabelOption>> getLabels() {
        // ... implementation
    }
    
    @GetMapping("/sources")
    public ResponseEntity<List<PersonSourceOption>> getSources() {
        // ... implementation
    }
    
    @GetMapping("/owners")
    public ResponseEntity<List<PersonOwner>> getOwners() {
        // ... implementation
    }
    
    @GetMapping("/{id}/summary")
    public ResponseEntity<PersonSummary> getPersonSummary(@PathVariable Long id) {
        // ... implementation
    }
    
    @PostMapping("/{id}/merge")
    public ResponseEntity<Person> mergePersons(@PathVariable Long id, @RequestBody MergeRequest request) {
        // ... implementation
    }
    
    // ✅ Generic routes LAST (after all specific routes)
    @GetMapping("/{id}")
    public ResponseEntity<Person> getPerson(@PathVariable Long id) {
        // ... implementation
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<Person> updatePerson(@PathVariable Long id, @RequestBody PersonRequest request) {
        // ... implementation
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePerson(@PathVariable Long id) {
        // ... implementation
    }
}
```

### Option 2: Use Different Path Structure

Move custom filters to a separate path:

```java
@RestController
@RequestMapping("/api/persons/custom-filters")
public class PersonCustomFilterController {
    
    @GetMapping
    public ResponseEntity<Map<String, PersonFilterCondition[]>> getCustomFilters() {
        // ... implementation
    }
    
    @PostMapping
    public ResponseEntity<Void> saveCustomFilter(@RequestBody CustomFilterRequest request) {
        // ... implementation
    }
    
    @DeleteMapping("/{name}")
    public ResponseEntity<Void> deleteCustomFilter(@PathVariable String name) {
        // ... implementation
    }
}
```

Then update frontend to use `/api/persons/custom-filters` (no change needed, but backend structure changes).

### Option 3: Use Path Pattern Matching

Add a constraint to the `{id}` route to only match numeric values:

```java
@GetMapping("/{id:^[0-9]+$}")  // Only matches numeric IDs
public ResponseEntity<Person> getPerson(@PathVariable Long id) {
    // ... implementation
}
```

This ensures that "custom-filters" won't match the `{id}` pattern.

## Frontend Code (Current)

The frontend is correctly calling:

```typescript
// src/services/api.ts
listCustomFilters: async (): Promise<SavedPersonFilter[]> => {
  const response = await api.get<Record<string, PersonFilterCondition[]>>('/custom-filters');
  // ...
}

saveCustomFilter: async (name: string, conditions: PersonFilterCondition[]): Promise<void> => {
  await api.post<void>('/custom-filters', { name, conditions });
}

deleteCustomFilter: async (name: string): Promise<void> => {
  await api.delete<void>(`/custom-filters/${encodeURIComponent(name)}`);
}
```

These calls are correct and should work once the backend routing is fixed.

## Required Backend Endpoints

### 1. GET /api/persons/custom-filters
**Response**:
```json
{
  "filterName1": [
    { "field": "category", "operator": "equals", "value": "HOT_LEAD" }
  ],
  "filterName2": [
    { "field": "source", "operator": "equals", "value": "INSTAGRAM" }
  ]
}
```

### 2. POST /api/persons/custom-filters
**Request Body**:
```json
{
  "name": "My Custom Filter",
  "conditions": [
    { "field": "category", "operator": "equals", "value": "HOT_LEAD" }
  ]
}
```

### 3. DELETE /api/persons/custom-filters/{name}
**Path Parameter**: `name` (URL encoded filter name)

## Testing

After fixing the backend routing:

1. Test `GET /api/persons/custom-filters` - should return custom filters, not error
2. Test `GET /api/persons/123` - should still work for numeric IDs
3. Test `GET /api/persons/custom-filters` - should NOT match `/{id}` route

## Summary

- **Issue**: Backend route ordering conflict
- **Fix**: Move specific routes (`/custom-filters`, `/labels`, `/sources`, etc.) BEFORE generic `/{id}` route
- **Frontend**: No changes needed, frontend code is correct
- **Priority**: High - this breaks custom filters functionality

