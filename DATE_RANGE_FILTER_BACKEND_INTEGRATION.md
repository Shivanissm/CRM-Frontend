# Date Range Filter Backend Integration Guide

## Overview
This document describes the backend requirements for implementing the date range filter functionality on the Persons page. The frontend sends `leadFrom` and `leadTo` query parameters to filter persons by their `leadDate` field.

## Frontend Implementation

### Date Format
The frontend sends dates in **DD/MM/YYYY** format (e.g., `01/12/2024`).

### Query Parameters
- `leadFrom`: Start date in DD/MM/YYYY format (inclusive)
- `leadTo`: End date in DD/MM/YYYY format (inclusive)

### Example API Calls

#### Today's Persons
```
GET /api/persons?leadFrom=01/12/2024&leadTo=01/12/2024
```

#### This Week's Persons
```
GET /api/persons?leadFrom=25/11/2024&leadTo=01/12/2024
```

#### Custom Date Range
```
GET /api/persons?leadFrom=15/11/2024&leadTo=30/11/2024
```

## Backend Requirements

### 1. Date Format Parsing
The backend must parse the **DD/MM/YYYY** format from the query parameters.

**Java Example:**
```java
@RequestParam(required = false) String leadFrom,
@RequestParam(required = false) String leadTo

// Parse DD/MM/YYYY format
DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
LocalDate startDate = leadFrom != null ? LocalDate.parse(leadFrom, formatter) : null;
LocalDate endDate = leadTo != null ? LocalDate.parse(leadTo, formatter) : null;
```

**Spring Boot Example:**
```java
@GetMapping
public ResponseEntity<PageResponse<Person>> listPersons(
    @RequestParam(required = false) @DateTimeFormat(pattern = "dd/MM/yyyy") LocalDate leadFrom,
    @RequestParam(required = false) @DateTimeFormat(pattern = "dd/MM/yyyy") LocalDate leadTo,
    // ... other parameters
) {
    // Implementation
}
```

### 2. Date Range Filtering Logic

#### Inclusive Range
Both `leadFrom` and `leadTo` should be **inclusive**, meaning:
- `leadFrom`: Include all persons with `leadDate >= leadFrom` (at start of day: 00:00:00)
- `leadTo`: Include all persons with `leadDate <= leadTo` (at end of day: 23:59:59.999)

#### Time Component Handling
When comparing dates, the backend should:
1. For `leadFrom`: Compare at the start of the day (00:00:00.000)
2. For `leadTo`: Compare at the end of the day (23:59:59.999)

This ensures that:
- If `leadFrom = 01/12/2024` and `leadTo = 01/12/2024`, it includes all persons with `leadDate` on December 1st, 2024, regardless of the time component.
- If a person's `leadDate` is stored as `2024-12-01 14:30:00`, it should be included in the range `leadFrom=01/12/2024&leadTo=01/12/2024`.

### 3. Database Query Implementation

#### JPA Specification Example (Java/Spring Boot)
```java
public static Specification<Person> hasLeadDateBetween(LocalDate leadFrom, LocalDate leadTo) {
    return (root, query, cb) -> {
        if (leadFrom == null && leadTo == null) {
            return cb.conjunction(); // No filter
        }
        
        Path<LocalDateTime> leadDatePath = root.get("leadDate");
        
        List<Predicate> predicates = new ArrayList<>();
        
        if (leadFrom != null) {
            // Start of day for leadFrom (inclusive)
            LocalDateTime startDateTime = leadFrom.atStartOfDay();
            predicates.add(cb.greaterThanOrEqualTo(leadDatePath, startDateTime));
        }
        
        if (leadTo != null) {
            // End of day for leadTo (inclusive)
            LocalDateTime endDateTime = leadTo.atTime(23, 59, 59, 999999999);
            predicates.add(cb.lessThanOrEqualTo(leadDatePath, endDateTime));
        }
        
        return cb.and(predicates.toArray(new Predicate[0]));
    };
}
```

#### Native SQL Example
```sql
SELECT * FROM persons
WHERE 
    (lead_date >= CAST(:leadFrom AS DATE) OR :leadFrom IS NULL)
    AND (lead_date <= CAST(:leadTo AS DATE) + INTERVAL '1 day' - INTERVAL '1 second' OR :leadTo IS NULL)
```

#### Criteria API Example
```java
CriteriaBuilder cb = entityManager.getCriteriaBuilder();
CriteriaQuery<Person> query = cb.createQuery(Person.class);
Root<Person> root = query.from(Person.class);

List<Predicate> predicates = new ArrayList<>();

if (leadFrom != null) {
    LocalDateTime startDateTime = leadFrom.atStartOfDay();
    predicates.add(cb.greaterThanOrEqualTo(root.get("leadDate"), startDateTime));
}

if (leadTo != null) {
    LocalDateTime endDateTime = leadTo.atTime(23, 59, 59, 999999999);
    predicates.add(cb.lessThanOrEqualTo(root.get("leadDate"), endDateTime));
}

if (!predicates.isEmpty()) {
    query.where(cb.and(predicates.toArray(new Predicate[0])));
}
```

### 4. Service Layer Implementation

```java
@Service
public class PersonService {
    
    @Autowired
    private PersonRepository personRepository;
    
    public Page<Person> findPersons(
        LocalDate leadFrom,
        LocalDate leadTo,
        // ... other filters
        Pageable pageable
    ) {
        Specification<Person> spec = Specification.where(null);
        
        if (leadFrom != null || leadTo != null) {
            spec = spec.and(hasLeadDateBetween(leadFrom, leadTo));
        }
        
        // Add other filters...
        
        return personRepository.findAll(spec, pageable);
    }
    
    private Specification<Person> hasLeadDateBetween(LocalDate leadFrom, LocalDate leadTo) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            
            if (leadFrom != null) {
                LocalDateTime startDateTime = leadFrom.atStartOfDay();
                predicates.add(cb.greaterThanOrEqualTo(root.get("leadDate"), startDateTime));
            }
            
            if (leadTo != null) {
                LocalDateTime endDateTime = leadTo.atTime(23, 59, 59, 999999999);
                predicates.add(cb.lessThanOrEqualTo(root.get("leadDate"), endDateTime));
            }
            
            return predicates.isEmpty() 
                ? cb.conjunction() 
                : cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
```

### 5. Controller Implementation

```java
@RestController
@RequestMapping("/api/persons")
public class PersonController {
    
    @Autowired
    private PersonService personService;
    
    @GetMapping
    public ResponseEntity<PageResponse<Person>> listPersons(
        @RequestParam(required = false) @DateTimeFormat(pattern = "dd/MM/yyyy") LocalDate leadFrom,
        @RequestParam(required = false) @DateTimeFormat(pattern = "dd/MM/yyyy") LocalDate leadTo,
        // ... other parameters
        @PageableDefault(size = 10) Pageable pageable
    ) {
        Page<Person> persons = personService.findPersons(
            leadFrom,
            leadTo,
            // ... other filters
            pageable
        );
        
        return ResponseEntity.ok(PageResponse.of(persons));
    }
}
```

## Testing Checklist

### Test Cases

1. **Today's Filter**
   - Request: `GET /api/persons?leadFrom=01/12/2024&leadTo=01/12/2024`
   - Expected: Returns all persons with `leadDate` on December 1st, 2024 (regardless of time)
   - Test Data:
     - Person A: `leadDate = 2024-12-01 00:00:00` ✅ Should be included
     - Person B: `leadDate = 2024-12-01 14:30:00` ✅ Should be included
     - Person C: `leadDate = 2024-12-01 23:59:59` ✅ Should be included
     - Person D: `leadDate = 2024-11-30 23:59:59` ❌ Should NOT be included
     - Person E: `leadDate = 2024-12-02 00:00:00` ❌ Should NOT be included

2. **Date Range Filter**
   - Request: `GET /api/persons?leadFrom=25/11/2024&leadTo=01/12/2024`
   - Expected: Returns all persons with `leadDate` between November 25th and December 1st (inclusive)
   - Test Data:
     - Person A: `leadDate = 2024-11-25 00:00:00` ✅ Should be included
     - Person B: `leadDate = 2024-11-30 14:30:00` ✅ Should be included
     - Person C: `leadDate = 2024-12-01 23:59:59` ✅ Should be included
     - Person D: `leadDate = 2024-11-24 23:59:59` ❌ Should NOT be included
     - Person E: `leadDate = 2024-12-02 00:00:00` ❌ Should NOT be included

3. **Only leadFrom**
   - Request: `GET /api/persons?leadFrom=01/12/2024`
   - Expected: Returns all persons with `leadDate >= 2024-12-01 00:00:00`

4. **Only leadTo**
   - Request: `GET /api/persons?leadTo=01/12/2024`
   - Expected: Returns all persons with `leadDate <= 2024-12-01 23:59:59.999`

5. **No Date Filter**
   - Request: `GET /api/persons`
   - Expected: Returns all persons (no date filtering)

6. **Invalid Date Format**
   - Request: `GET /api/persons?leadFrom=2024-12-01` (YYYY-MM-DD format)
   - Expected: Should return a 400 Bad Request error with a clear error message

## Common Issues and Solutions

### Issue 1: "Today" filter not returning today's persons
**Cause:** The backend is comparing dates without considering the time component, or the end date is not set to end of day.

**Solution:** Ensure that:
- `leadFrom` is compared at start of day (00:00:00)
- `leadTo` is compared at end of day (23:59:59.999)

### Issue 2: Date format mismatch
**Cause:** Backend expects a different date format (e.g., YYYY-MM-DD or ISO format).

**Solution:** Use `@DateTimeFormat(pattern = "dd/MM/yyyy")` annotation or parse the date string manually with the correct format.

### Issue 3: Timezone issues
**Cause:** Dates are being converted to UTC or a different timezone, causing off-by-one-day errors.

**Solution:** 
- Store dates in the database as `LocalDate` or `DATE` type (without time component) if possible
- If using `LocalDateTime` or `TIMESTAMP`, ensure consistent timezone handling
- Consider storing dates in UTC and converting to local timezone only for display

### Issue 4: NULL leadDate handling
**Cause:** Persons with `NULL` leadDate are being included or excluded incorrectly.

**Solution:** Decide on the behavior:
- Option A: Exclude persons with `NULL` leadDate from date-filtered results
- Option B: Include persons with `NULL` leadDate only when no date filter is applied

**Recommended:** Exclude `NULL` leadDate from date-filtered results (Option A).

## Migration Steps

1. **Update Controller**
   - Add `leadFrom` and `leadTo` parameters with `@DateTimeFormat(pattern = "dd/MM/yyyy")`
   - Handle both parameters as optional

2. **Update Service Layer**
   - Add date range filtering logic
   - Implement inclusive range comparison with proper time handling

3. **Update Repository/DAO**
   - Add date range filtering to query methods
   - Use JPA Specifications, Criteria API, or native SQL as appropriate

4. **Test**
   - Test all date range scenarios
   - Test edge cases (same day, NULL dates, invalid formats)
   - Test with existing filters (category, organization, etc.)

5. **Deploy**
   - Deploy backend changes
   - Verify frontend integration works correctly

## API Specification

### Endpoint
```
GET /api/persons
```

### Query Parameters
| Parameter | Type | Format | Required | Description |
|-----------|------|--------|----------|-------------|
| `leadFrom` | String | DD/MM/YYYY | No | Start date (inclusive, start of day) |
| `leadTo` | String | DD/MM/YYYY | No | End date (inclusive, end of day) |
| `page` | Integer | - | No | Page number (0-indexed) |
| `size` | Integer | - | No | Page size |
| ... | ... | ... | ... | Other existing filters |

### Response
```json
{
  "content": [
    {
      "id": 1,
      "name": "John Doe",
      "leadDate": "2024-12-01",
      ...
    }
  ],
  "totalElements": 10,
  "totalPages": 1,
  "number": 0,
  "size": 10
}
```

### Error Responses
- **400 Bad Request**: Invalid date format
  ```json
  {
    "success": false,
    "message": "Invalid date format. Expected DD/MM/YYYY format.",
    "data": null
  }
  ```

## Notes

- The frontend sends dates in **DD/MM/YYYY** format, not ISO format (YYYY-MM-DD).
- Both `leadFrom` and `leadTo` are **inclusive**.
- The backend should handle the time component correctly (start of day for `leadFrom`, end of day for `leadTo`).
- If the backend currently expects a different date format, it needs to be updated to accept DD/MM/YYYY format, or the frontend needs to be updated to send the expected format (coordinate with frontend team).

