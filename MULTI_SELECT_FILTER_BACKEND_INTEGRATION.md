# Multi-Select Filter Backend Integration Guide

## Overview
This document describes the backend changes required to support multi-select filtering for `categoryId`, `organizationId`, `ownerId`, and `label` in the Persons API. Currently, the frontend sends comma-separated values (e.g., `categoryId=1,2,3`), but the backend only processes the first value.

## Frontend Implementation (Current)

### Request Format
The frontend sends filter parameters as comma-separated strings in the query parameters:

```
GET /api/persons?categoryId=1,2,3&organizationId=4,5&ownerId=6,7&label=BRIDAL_MAKEUP,BRIDAL_PLANNING&page=0&size=10
```

### Frontend Code Reference
- **File**: `src/services/api.ts`
- **Function**: `buildParams()`
- **Lines**: 68-107

The frontend handles both single values and arrays:
- Single value: `categoryId=1`
- Multiple values: `categoryId=1,2,3` (comma-separated)

## Backend Implementation Required

### 1. Request DTO/Parameter Handling

#### Option A: Accept Comma-Separated String (Recommended)
Modify the controller to accept comma-separated strings and parse them into lists.

**Example for Spring Boot (Java):**

```java
@GetMapping
public ResponseEntity<PageResponse<PersonDTO>> listPersons(
    @RequestParam(required = false) String categoryId,
    @RequestParam(required = false) String organizationId,
    @RequestParam(required = false) String ownerId,
    @RequestParam(required = false) String label,
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "10") int size,
    // ... other parameters
) {
    // Parse comma-separated strings to lists
    List<Long> categoryIds = parseCommaSeparatedIds(categoryId);
    List<Long> organizationIds = parseCommaSeparatedIds(organizationId);
    List<Long> ownerIds = parseCommaSeparatedIds(ownerId);
    List<String> labels = parseCommaSeparatedStrings(label);
    
    // Pass to service
    PageResponse<PersonDTO> response = personService.listPersons(
        categoryIds, organizationIds, ownerIds, labels, page, size, ...
    );
    
    return ResponseEntity.ok(response);
}

private List<Long> parseCommaSeparatedIds(String ids) {
    if (ids == null || ids.trim().isEmpty()) {
        return Collections.emptyList();
    }
    return Arrays.stream(ids.split(","))
        .map(String::trim)
        .filter(s -> !s.isEmpty())
        .map(Long::parseLong)
        .collect(Collectors.toList());
}

private List<String> parseCommaSeparatedStrings(String values) {
    if (values == null || values.trim().isEmpty()) {
        return Collections.emptyList();
    }
    return Arrays.stream(values.split(","))
        .map(String::trim)
        .filter(s -> !s.isEmpty())
        .collect(Collectors.toList());
}
```

#### Option B: Accept Multiple Query Parameters
Alternatively, accept multiple query parameters with the same name:

```
GET /api/persons?categoryId=1&categoryId=2&categoryId=3
```

**Example for Spring Boot:**

```java
@GetMapping
public ResponseEntity<PageResponse<PersonDTO>> listPersons(
    @RequestParam(required = false) List<Long> categoryId,
    @RequestParam(required = false) List<Long> organizationId,
    @RequestParam(required = false) List<Long> ownerId,
    @RequestParam(required = false) List<String> label,
    // ... other parameters
) {
    // Directly use the lists
    PageResponse<PersonDTO> response = personService.listPersons(
        categoryId, organizationId, ownerId, label, page, size, ...
    );
    
    return ResponseEntity.ok(response);
}
```

**Note**: Option A (comma-separated) is recommended as it matches the current frontend implementation and is more URL-friendly.

### 2. Service Layer Changes

Update the service method signature to accept lists instead of single values:

**Before:**
```java
public PageResponse<PersonDTO> listPersons(
    Long categoryId,
    Long organizationId,
    Long ownerId,
    String label,
    int page,
    int size,
    // ... other filters
) {
    // Filter by single values
}
```

**After:**
```java
public PageResponse<PersonDTO> listPersons(
    List<Long> categoryIds,
    List<Long> organizationIds,
    List<Long> ownerIds,
    List<String> labels,
    int page,
    int size,
    // ... other filters
) {
    // Filter by lists (IN clause)
}
```

### 3. Repository/Query Changes

#### JPA Repository Example

**Before:**
```java
@Query("SELECT p FROM Person p WHERE " +
       "(:categoryId IS NULL OR p.categoryId = :categoryId) AND " +
       "(:organizationId IS NULL OR p.organizationId = :organizationId) AND " +
       "(:ownerId IS NULL OR p.ownerId = :ownerId) AND " +
       "(:label IS NULL OR p.label = :label)")
Page<Person> findByFilters(
    @Param("categoryId") Long categoryId,
    @Param("organizationId") Long organizationId,
    @Param("ownerId") Long ownerId,
    @Param("label") String label,
    Pageable pageable
);
```

**After:**
```java
@Query("SELECT p FROM Person p WHERE " +
       "(:categoryIds IS NULL OR SIZE(:categoryIds) = 0 OR p.categoryId IN :categoryIds) AND " +
       "(:organizationIds IS NULL OR SIZE(:organizationIds) = 0 OR p.organizationId IN :organizationIds) AND " +
       "(:ownerIds IS NULL OR SIZE(:ownerIds) = 0 OR p.ownerId IN :ownerIds) AND " +
       "(:labels IS NULL OR SIZE(:labels) = 0 OR p.label IN :labels)")
Page<Person> findByFilters(
    @Param("categoryIds") List<Long> categoryIds,
    @Param("organizationIds") List<Long> organizationIds,
    @Param("ownerIds") List<Long> ownerIds,
    @Param("labels") List<String> labels,
    Pageable pageable
);
```

#### Dynamic Query Builder Example (JPA Criteria API)

```java
public Page<Person> findByFilters(
    List<Long> categoryIds,
    List<Long> organizationIds,
    List<Long> ownerIds,
    Pageable pageable
) {
    CriteriaBuilder cb = entityManager.getCriteriaBuilder();
    CriteriaQuery<Person> query = cb.createQuery(Person.class);
    Root<Person> root = query.from(Person.class);
    
    List<Predicate> predicates = new ArrayList<>();
    
    // Category filter
    if (categoryIds != null && !categoryIds.isEmpty()) {
        predicates.add(root.get("categoryId").in(categoryIds));
    }
    
    // Organization filter
    if (organizationIds != null && !organizationIds.isEmpty()) {
        predicates.add(root.get("organizationId").in(organizationIds));
    }
    
    // Owner filter
    if (ownerIds != null && !ownerIds.isEmpty()) {
        predicates.add(root.get("ownerId").in(ownerIds));
    }
    
    // Combine all predicates with AND
    if (!predicates.isEmpty()) {
        query.where(cb.and(predicates.toArray(new Predicate[0])));
    }
    
    // Apply pagination
    TypedQuery<Person> typedQuery = entityManager.createQuery(query);
    typedQuery.setFirstResult((int) pageable.getOffset());
    typedQuery.setMaxResults(pageable.getPageSize());
    
    List<Person> results = typedQuery.getResultList();
    
    // Get total count
    CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
    countQuery.select(cb.count(countQuery.from(Person.class)));
    if (!predicates.isEmpty()) {
        countQuery.where(cb.and(predicates.toArray(new Predicate[0])));
    }
    Long total = entityManager.createQuery(countQuery).getSingleResult();
    
    return new PageImpl<>(results, pageable, total);
}
```

#### Native SQL Example

```sql
SELECT * FROM persons p
WHERE 
    (:categoryIds IS NULL OR p.category_id IN (:categoryIds)) AND
    (:organizationIds IS NULL OR p.organization_id IN (:organizationIds)) AND
    (:ownerIds IS NULL OR p.owner_id IN (:ownerIds))
ORDER BY p.name ASC
LIMIT :size OFFSET :offset
```

### 4. Backward Compatibility

Ensure backward compatibility with single values:

```java
private List<Long> parseCommaSeparatedIds(String ids) {
    if (ids == null || ids.trim().isEmpty()) {
        return Collections.emptyList();
    }
    // Handle both single value and comma-separated values
    return Arrays.stream(ids.split(","))
        .map(String::trim)
        .filter(s -> !s.isEmpty())
        .map(Long::parseLong)
        .collect(Collectors.toList());
}
```

This ensures:
- `categoryId=1` → `[1]` (single value)
- `categoryId=1,2,3` → `[1, 2, 3]` (multiple values)
- `categoryId=` → `[]` (empty, no filter)

### 5. Validation

Add validation to ensure IDs are valid:

```java
private List<Long> parseCommaSeparatedIds(String ids) {
    if (ids == null || ids.trim().isEmpty()) {
        return Collections.emptyList();
    }
    try {
        return Arrays.stream(ids.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .map(Long::parseLong)
            .filter(id -> id > 0) // Ensure positive IDs
            .distinct() // Remove duplicates
            .collect(Collectors.toList());
    } catch (NumberFormatException e) {
        throw new IllegalArgumentException("Invalid ID format: " + ids, e);
    }
}
```

### 6. Error Handling

Handle invalid input gracefully:

```java
@ExceptionHandler(IllegalArgumentException.class)
public ResponseEntity<ErrorResponse> handleInvalidFilter(IllegalArgumentException e) {
    ErrorResponse error = new ErrorResponse(
        "INVALID_FILTER",
        "Invalid filter parameter: " + e.getMessage()
    );
    return ResponseEntity.badRequest().body(error);
}
```

## API Endpoint Specification

### Endpoint
```
GET /api/persons
```

### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `categoryId` | String | No | Comma-separated category IDs | `1,2,3` |
| `organizationId` | String | No | Comma-separated organization IDs | `4,5` |
| `ownerId` | String | No | Comma-separated owner/user IDs | `6,7,8` |
| `label` | String | No | Comma-separated label codes | `BRIDAL_MAKEUP,BRIDAL_PLANNING` |
| `page` | Integer | No | Page number (0-indexed) | `0` |
| `size` | Integer | No | Page size | `10` |
| `sort` | String | No | Sort field and direction | `name,asc` |
| `q` | String | No | Search query | `john` |
| `label` | String | No | Person label | `BRIDAL_MAKEUP` |
| `source` | String | No | Person source | `INSTAGRAM` |
| `leadFrom` | String | No | Lead date from (YYYY-MM-DD) | `2025-01-01` |
| `leadTo` | String | No | Lead date to (YYYY-MM-DD) | `2025-12-31` |

### Response Format

```json
{
  "content": [
    {
      "id": 1,
      "name": "John Doe",
      "categoryId": 1,
      "categoryName": "Photography",
      "organizationId": 4,
      "organizationName": "RSP",
      "ownerId": 6,
      "ownerDisplayName": "Shubham Kumar",
      // ... other fields
    }
  ],
  "totalElements": 100,
  "totalPages": 10,
  "size": 10,
  "number": 0
}
```

### Example Requests

**Single category:**
```
GET /api/persons?categoryId=1&page=0&size=10
```

**Multiple categories:**
```
GET /api/persons?categoryId=1,2,3&page=0&size=10
```

**Multiple filters:**
```
GET /api/persons?categoryId=1,2&organizationId=4,5&ownerId=6,7&label=BRIDAL_MAKEUP,BRIDAL_PLANNING&page=0&size=10
```

**Combined with other filters:**
```
GET /api/persons?categoryId=1,2&organizationId=4&label=BRIDAL_MAKEUP&q=john&page=0&size=10
```

## Testing Checklist

### Unit Tests

- [ ] Test parsing of single ID: `categoryId=1` → `[1]`
- [ ] Test parsing of multiple IDs: `categoryId=1,2,3` → `[1, 2, 3]`
- [ ] Test parsing of empty string: `categoryId=` → `[]`
- [ ] Test parsing of null: `categoryId=null` → `[]`
- [ ] Test parsing with whitespace: `categoryId=1, 2, 3` → `[1, 2, 3]`
- [ ] Test parsing with duplicates: `categoryId=1,2,1` → `[1, 2]` (distinct)
- [ ] Test invalid ID format: `categoryId=abc` → throws `IllegalArgumentException`
- [ ] Test negative IDs: `categoryId=-1` → filtered out (only positive)

### Integration Tests

- [ ] Test filtering by single category ID
- [ ] Test filtering by multiple category IDs (OR logic)
- [ ] Test filtering by single organization ID
- [ ] Test filtering by multiple organization IDs (OR logic)
- [ ] Test filtering by single owner ID
- [ ] Test filtering by multiple owner IDs (OR logic)
- [ ] Test filtering by single label
- [ ] Test filtering by multiple labels (OR logic)
- [ ] Test combining multiple multi-select filters (AND logic)
- [ ] Test combining multi-select filters with other filters (AND logic)
- [ ] Test pagination with multi-select filters
- [ ] Test sorting with multi-select filters
- [ ] Test empty result set when no matches
- [ ] Test backward compatibility with single values

### Example Test Cases

```java
@Test
public void testListPersonsWithMultipleCategories() {
    // Given
    List<Long> categoryIds = Arrays.asList(1L, 2L);
    
    // When
    PageResponse<PersonDTO> response = personService.listPersons(
        categoryIds, null, null, 0, 10, ...
    );
    
    // Then
    assertThat(response.getContent()).hasSize(5);
    assertThat(response.getContent())
        .extracting(PersonDTO::getCategoryId)
        .containsAnyOf(1L, 2L);
}

@Test
public void testListPersonsWithMultipleFilters() {
    // Given
    List<Long> categoryIds = Arrays.asList(1L, 2L);
    List<Long> organizationIds = Arrays.asList(4L, 5L);
    List<Long> ownerIds = Arrays.asList(6L);
    
    // When
    PageResponse<PersonDTO> response = personService.listPersons(
        categoryIds, organizationIds, ownerIds, 0, 10, ...
    );
    
    // Then
    assertThat(response.getContent()).allMatch(person ->
        categoryIds.contains(person.getCategoryId()) &&
        organizationIds.contains(person.getOrganizationId()) &&
        ownerIds.contains(person.getOwnerId())
    );
}
```

## Migration Steps

1. **Update Controller**: Modify the controller to accept comma-separated strings and parse them into lists.

2. **Update Service Interface**: Change method signatures to accept `List<Long>` instead of `Long` for filter parameters.

3. **Update Service Implementation**: Modify the service to handle lists and use `IN` clauses in queries.

4. **Update Repository/Query**: Change queries to use `IN` clauses instead of equality checks.

5. **Add Validation**: Add validation for ID parsing and error handling.

6. **Update Tests**: Add unit and integration tests for multi-select functionality.

7. **Test Backward Compatibility**: Ensure existing single-value requests still work.

8. **Deploy**: Deploy backend changes.

9. **Verify Frontend**: Test the frontend with the updated backend to ensure multi-select filtering works correctly.

## Notes

- The frontend already sends comma-separated values, so no frontend changes are required.
- The backend should maintain backward compatibility with single values.
- Empty lists should be treated as "no filter" (return all results).
- The `IN` clause in SQL/JPA will handle the OR logic automatically (e.g., `categoryId IN (1,2,3)` means `categoryId = 1 OR categoryId = 2 OR categoryId = 3`).
- Multiple filters are combined with AND logic (e.g., `categoryId IN (1,2) AND organizationId IN (4,5)`).

## Example Implementation (Complete)

### Controller
```java
@RestController
@RequestMapping("/api/persons")
public class PersonController {
    
    @Autowired
    private PersonService personService;
    
    @GetMapping
    public ResponseEntity<PageResponse<PersonDTO>> listPersons(
        @RequestParam(required = false) String categoryId,
        @RequestParam(required = false) String organizationId,
        @RequestParam(required = false) String ownerId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false) String q,
        // ... other parameters
    ) {
        List<Long> categoryIds = parseCommaSeparatedIds(categoryId);
        List<Long> organizationIds = parseCommaSeparatedIds(organizationId);
        List<Long> ownerIds = parseCommaSeparatedIds(ownerId);
        
        PageResponse<PersonDTO> response = personService.listPersons(
            categoryIds, organizationIds, ownerIds, page, size, sort, q, ...
        );
        
        return ResponseEntity.ok(response);
    }
    
    private List<Long> parseCommaSeparatedIds(String ids) {
        if (ids == null || ids.trim().isEmpty()) {
            return Collections.emptyList();
        }
        try {
            return Arrays.stream(ids.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(Long::parseLong)
                .filter(id -> id > 0)
                .distinct()
                .collect(Collectors.toList());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid ID format: " + ids, e);
        }
    }
}
```

### Service
```java
@Service
public class PersonService {
    
    @Autowired
    private PersonRepository personRepository;
    
    public PageResponse<PersonDTO> listPersons(
        List<Long> categoryIds,
        List<Long> organizationIds,
        List<Long> ownerIds,
        int page,
        int size,
        String sort,
        String q,
        // ... other filters
    ) {
        Pageable pageable = PageRequest.of(page, size, parseSort(sort));
        Page<Person> persons = personRepository.findByFilters(
            categoryIds, organizationIds, ownerIds, q, ..., pageable
        );
        
        return new PageResponse<>(
            persons.getContent().stream()
                .map(this::toDTO)
                .collect(Collectors.toList()),
            persons.getTotalElements(),
            persons.getTotalPages(),
            persons.getSize(),
            persons.getNumber()
        );
    }
}
```

### Repository
```java
@Repository
public interface PersonRepository extends JpaRepository<Person, Long> {
    
    @Query("SELECT p FROM Person p WHERE " +
           "(:categoryIds IS NULL OR SIZE(:categoryIds) = 0 OR p.categoryId IN :categoryIds) AND " +
           "(:organizationIds IS NULL OR SIZE(:organizationIds) = 0 OR p.organizationId IN :organizationIds) AND " +
           "(:ownerIds IS NULL OR SIZE(:ownerIds) = 0 OR p.ownerId IN :ownerIds) AND " +
           "(:q IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', :q, '%')))")
    Page<Person> findByFilters(
        @Param("categoryIds") List<Long> categoryIds,
        @Param("organizationIds") List<Long> organizationIds,
        @Param("ownerIds") List<Long> ownerIds,
        @Param("q") String q,
        Pageable pageable
    );
}
```

## Support

For questions or issues, please refer to:
- Frontend implementation: `src/services/api.ts` (lines 68-107)
- Frontend types: `src/types/person.ts` (lines 43-63)

