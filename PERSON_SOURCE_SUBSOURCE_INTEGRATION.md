# Person Source and Sub Source Integration Guide

This document describes the frontend changes made for Person Source and Sub Source fields and provides guidance for backend integration.

## Frontend Changes Summary

### 1. Person Source Field
- **Changed from**: Person sources (from `/api/persons/sources`)
- **Changed to**: Deal sources (from `/api/deals/sources`)
- **Status**: Required field (marked with red asterisk)
- **Options**: Direct, Divert, Reference, Planner

### 2. Person Sub Source Field
- **New field**: Added to person form
- **Source**: Deal sub sources (from `/api/deals/sub-sources`)
- **Status**: Optional field
- **Visibility**: Only shown when source is "Direct"
- **Options**: Instagram, Whatsapp, Landing Page, Email

## API Endpoints Required

### 1. Get Deal Sources
**Endpoint**: `GET /api/deals/sources`

**Response Format**:
```json
{
  "data": [
    { "code": "Direct", "label": "Direct" },
    { "code": "Divert", "label": "Divert" },
    { "code": "Reference", "label": "Reference" },
    { "code": "Planner", "label": "Planner" }
  ]
}
```

**Alternative Response Format** (if using unwrap):
```json
[
  { "code": "Direct", "label": "Direct" },
  { "code": "Divert", "label": "Divert" },
  { "code": "Reference", "label": "Reference" },
  { "code": "Planner", "label": "Planner" }
]
```

### 2. Get Deal Sub Sources
**Endpoint**: `GET /api/deals/sub-sources`

**Response Format**:
```json
{
  "data": [
    { "code": "Instagram", "label": "Instagram" },
    { "code": "Whatsapp", "label": "Whatsapp" },
    { "code": "Landing Page", "label": "Landing Page" },
    { "code": "Email", "label": "Email" }
  ]
}
```

**Alternative Response Format** (if using unwrap):
```json
[
  { "code": "Instagram", "label": "Instagram" },
  { "code": "Whatsapp", "label": "Whatsapp" },
  { "code": "Landing Page", "label": "Landing Page" },
  { "code": "Email", "label": "Email" }
]
```

## Person Entity Changes

### Database Schema Updates

Add the following fields to the `Person` entity:

```sql
ALTER TABLE person 
ADD COLUMN source VARCHAR(255) NULL,
ADD COLUMN sub_source VARCHAR(255) NULL;
```

### Entity Class Updates

**Java Example**:
```java
@Entity
@Table(name = "person")
public class Person {
    // ... existing fields ...
    
    @Column(name = "source")
    private String source;
    
    @Column(name = "sub_source")
    private String subSource;
    
    // Getters and setters
    public String getSource() {
        return source;
    }
    
    public void setSource(String source) {
        this.source = source;
    }
    
    public String getSubSource() {
        return subSource;
    }
    
    public void setSubSource(String subSource) {
        this.subSource = subSource;
    }
}
```

### DTO Updates

**PersonRequest DTO**:
```java
public class PersonRequest {
    // ... existing fields ...
    
    @JsonProperty("source")
    private String source;
    
    @JsonProperty("subSource")
    private String subSource;
    
    // Getters and setters
    public String getSource() {
        return source;
    }
    
    public void setSource(String source) {
        this.source = source;
    }
    
    public String getSubSource() {
        return subSource;
    }
    
    public void setSubSource(String subSource) {
        this.subSource = subSource;
    }
}
```

**PersonResponse DTO**:
```java
public class PersonResponse {
    // ... existing fields ...
    
    @JsonProperty("source")
    private String source;
    
    @JsonProperty("subSource")
    private String subSource;
    
    // Getters and setters
    // ...
}
```

## Backend API Implementation

### 1. Deal Sources Endpoint

**Controller**:
```java
@RestController
@RequestMapping("/api/deals")
public class DealController {
    
    @GetMapping("/sources")
    public ResponseEntity<List<SourceOption>> getSources() {
        List<SourceOption> sources = Arrays.asList(
            new SourceOption("Direct", "Direct"),
            new SourceOption("Divert", "Divert"),
            new SourceOption("Reference", "Reference"),
            new SourceOption("Planner", "Planner")
        );
        return ResponseEntity.ok(sources);
    }
    
    @GetMapping("/sub-sources")
    public ResponseEntity<List<SourceOption>> getSubSources() {
        List<SourceOption> subSources = Arrays.asList(
            new SourceOption("Instagram", "Instagram"),
            new SourceOption("Whatsapp", "Whatsapp"),
            new SourceOption("Landing Page", "Landing Page"),
            new SourceOption("Email", "Email")
        );
        return ResponseEntity.ok(subSources);
    }
}

// SourceOption DTO
public class SourceOption {
    private String code;
    private String label;
    
    public SourceOption(String code, String label) {
        this.code = code;
        this.label = label;
    }
    
    // Getters and setters
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
}
```

### 2. Person Service Updates

**Update Person Creation/Update Methods**:
```java
@Service
public class PersonService {
    
    public Person createPerson(PersonRequest request) {
        Person person = new Person();
        // ... map existing fields ...
        person.setSource(request.getSource());
        person.setSubSource(request.getSubSource());
        return personRepository.save(person);
    }
    
    public Person updatePerson(Long id, PersonRequest request) {
        Person person = personRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("Person not found"));
        
        // ... update existing fields ...
        person.setSource(request.getSource());
        person.setSubSource(request.getSubSource());
        
        return personRepository.save(person);
    }
}
```

### 3. Validation Rules

**Recommended Validations**:
```java
public class PersonRequest {
    
    @NotBlank(message = "Name is required")
    private String name;
    
    @Pattern(regexp = "^(Direct|Divert|Reference|Planner)$", 
             message = "Source must be one of: Direct, Divert, Reference, Planner")
    private String source;
    
    @Pattern(regexp = "^(Instagram|Whatsapp|Landing Page|Email)$", 
             message = "Sub source must be one of: Instagram, Whatsapp, Landing Page, Email")
    private String subSource;
    
    // Custom validation: subSource should only be set when source is "Direct"
    @AssertTrue(message = "Sub source can only be set when source is 'Direct'")
    public boolean isValidSubSource() {
        if (subSource != null && !subSource.isEmpty()) {
            return "Direct".equals(source);
        }
        return true; // subSource is optional
    }
}
```

## Frontend Request/Response Format

### Create/Update Person Request

**Request Body**:
```json
{
  "name": "John Doe",
  "organizationId": 1,
  "ownerId": 1,
  "phone": "+1234567890",
  "email": "john@example.com",
  "source": "Direct",
  "subSource": "Instagram",
  "label": "HOT_LEAD",
  "leadDate": "2025-01-15"
}
```

**Response Body**:
```json
{
  "id": 1,
  "name": "John Doe",
  "organizationId": 1,
  "ownerId": 1,
  "phone": "+1234567890",
  "email": "john@example.com",
  "source": "Direct",
  "subSource": "Instagram",
  "label": "HOT_LEAD",
  "leadDate": "2025-01-15",
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:00:00Z"
}
```

## Migration Steps

### Step 1: Database Migration
1. Create a migration script to add `source` and `sub_source` columns to the `person` table
2. Set both columns as nullable (optional fields)
3. Run the migration

### Step 2: Entity Updates
1. Add `source` and `subSource` fields to the `Person` entity
2. Add appropriate JPA annotations
3. Update getters and setters

### Step 3: DTO Updates
1. Add `source` and `subSource` to `PersonRequest` DTO
2. Add `source` and `subSource` to `PersonResponse` DTO
3. Add validation annotations if needed

### Step 4: Service Layer Updates
1. Update `createPerson` method to handle source and subSource
2. Update `updatePerson` method to handle source and subSource
3. Add validation logic for subSource (only when source is "Direct")

### Step 5: Controller Updates
1. Implement `GET /api/deals/sources` endpoint
2. Implement `GET /api/deals/sub-sources` endpoint
3. Ensure Person endpoints return source and subSource in responses

### Step 6: Testing
1. Test creating a person with source and subSource
2. Test updating a person's source and subSource
3. Test validation: subSource should only be allowed when source is "Direct"
4. Test API endpoints return correct source and subSource options

## Frontend Implementation Details

### Files Modified

1. **src/services/deals.ts**
   - Added `listSources()` method
   - Added `listSubSources()` method

2. **src/components/AddPersonModal.tsx**
   - Changed source dropdown to use deal sources
   - Added sub source dropdown (conditional on source = "Direct")
   - Added form validation for source (required)
   - Auto-clear subSource when source changes away from "Direct"

3. **src/types/person.ts**
   - Added `subSource?: string | null;` to `PersonRequest` interface

### Frontend Behavior

- **Source Field**: 
  - Required field (marked with red asterisk)
  - Fetches options from `/api/deals/sources`
  - Falls back to hardcoded values if API fails

- **Sub Source Field**:
  - Optional field
  - Only visible when source is "Direct"
  - Fetches options from `/api/deals/sub-sources`
  - Falls back to hardcoded values if API fails
  - Automatically cleared when source changes away from "Direct"

## Notes

1. **Source Values**: The frontend expects exact string matches: "Direct", "Divert", "Reference", "Planner"
2. **Sub Source Values**: The frontend expects exact string matches: "Instagram", "Whatsapp", "Landing Page", "Email"
3. **Case Sensitivity**: Values are case-sensitive, ensure backend returns exact matches
4. **Null Handling**: Both fields can be null/empty in the database
5. **Validation**: Backend should validate that subSource is only set when source is "Direct"

## Example Backend Controller (Complete)

```java
@RestController
@RequestMapping("/api/deals")
public class DealController {
    
    @GetMapping("/sources")
    public ResponseEntity<ApiResponse<List<SourceOption>>> getSources() {
        List<SourceOption> sources = Arrays.asList(
            new SourceOption("Direct", "Direct"),
            new SourceOption("Divert", "Divert"),
            new SourceOption("Reference", "Reference"),
            new SourceOption("Planner", "Planner")
        );
        return ResponseEntity.ok(ApiResponse.success(sources));
    }
    
    @GetMapping("/sub-sources")
    public ResponseEntity<ApiResponse<List<SourceOption>>> getSubSources() {
        List<SourceOption> subSources = Arrays.asList(
            new SourceOption("Instagram", "Instagram"),
            new SourceOption("Whatsapp", "Whatsapp"),
            new SourceOption("Landing Page", "Landing Page"),
            new SourceOption("Email", "Email")
        );
        return ResponseEntity.ok(ApiResponse.success(subSources));
    }
}

// If your API uses a wrapper response
public class ApiResponse<T> {
    private boolean success;
    private T data;
    private String message;
    
    public static <T> ApiResponse<T> success(T data) {
        ApiResponse<T> response = new ApiResponse<>();
        response.setSuccess(true);
        response.setData(data);
        return response;
    }
    
    // Getters and setters
}
```

## Testing Checklist

- [ ] Database migration completed successfully
- [ ] Person entity updated with source and subSource fields
- [ ] PersonRequest DTO includes source and subSource
- [ ] PersonResponse DTO includes source and subSource
- [ ] GET /api/deals/sources returns correct options
- [ ] GET /api/deals/sub-sources returns correct options
- [ ] Creating person with source works
- [ ] Creating person with source and subSource works
- [ ] Updating person source works
- [ ] Updating person subSource works
- [ ] Validation: subSource only allowed when source is "Direct"
- [ ] Frontend can fetch and display sources
- [ ] Frontend can fetch and display sub sources
- [ ] Sub source field only appears when source is "Direct"

