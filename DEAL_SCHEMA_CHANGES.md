# Deal Schema Changes - Database Migration Guide

## Overview
This document outlines the database schema changes required to support the new fields added to the Create Deal pop-up form in the frontend.

## New Fields Added to Deal Entity

### 1. Label Field
- **Field Name**: `label`
- **Type**: `VARCHAR` or `STRING` (enum recommended)
- **Nullable**: `YES` (optional field)
- **Allowed Values**:
  - `DIRECT`
  - `DIVERT`
  - `DESTINATION`
  - `PARTY MAKEUP`
  - `PRE WEDDING`
- **Description**: Categorizes the deal by its type or origin
- **Default Value**: `NULL`

### 2. Source Field
- **Field Name**: `source`
- **Type**: `VARCHAR(255)` or `STRING`
- **Nullable**: `YES` (optional field)
- **Description**: Stores the source or origin of the deal (e.g., "Website", "Referral", "Social Media", etc.)
- **Default Value**: `NULL`

## Database Migration Steps

### For SQL Databases (PostgreSQL, MySQL, etc.)

```sql
-- Add label column to deals table
ALTER TABLE deals 
ADD COLUMN label VARCHAR(50) NULL;

-- Add source column to deals table
ALTER TABLE deals 
ADD COLUMN source VARCHAR(255) NULL;

-- Optional: Add check constraint for label values (if using SQL)
ALTER TABLE deals 
ADD CONSTRAINT chk_deal_label 
CHECK (label IS NULL OR label IN ('DIRECT', 'DIVERT', 'DESTINATION', 'PARTY MAKEUP', 'PRE WEDDING'));

-- Optional: Add index for label if you plan to filter by it frequently
CREATE INDEX idx_deals_label ON deals(label);

-- Optional: Add index for source if you plan to filter by it frequently
CREATE INDEX idx_deals_source ON deals(source);
```

### For MongoDB

```javascript
// Update the Deal schema/model to include:
{
  label: {
    type: String,
    enum: ['DIRECT', 'DIVERT', 'DESTINATION', 'PARTY MAKEUP', 'PRE WEDDING'],
    required: false,
    default: null
  },
  source: {
    type: String,
    required: false,
    default: null,
    maxlength: 255
  }
}
```

## Backend API Changes Required

### 1. Update Deal Entity/Model

Add the following fields to your Deal entity/model:

```typescript
// TypeScript/Node.js example
interface Deal {
  // ... existing fields ...
  label?: string | null;
  source?: string | null;
}
```

```java
// Java/Spring Boot example
@Entity
@Table(name = "deals")
public class Deal {
    // ... existing fields ...
    
    @Column(name = "label", length = 50)
    private String label;
    
    @Column(name = "source", length = 255)
    private String source;
}
```

```python
# Python/Django example
class Deal(models.Model):
    # ... existing fields ...
    label = models.CharField(max_length=50, null=True, blank=True, 
                             choices=[
                                 ('DIRECT', 'DIRECT'),
                                 ('DIVERT', 'DIVERT'),
                                 ('DESTINATION', 'DESTINATION'),
                                 ('PARTY MAKEUP', 'PARTY MAKEUP'),
                                 ('PRE WEDDING', 'PRE WEDDING'),
                             ])
    source = models.CharField(max_length=255, null=True, blank=True)
```

### 2. Update DealCreateRequest DTO

Add the fields to your create request DTO:

```typescript
// TypeScript example
interface DealCreateRequest {
  // ... existing fields ...
  label?: string | null;
  source?: string | null;
}
```

### 3. Update Deal Update DTO (if applicable)

```typescript
// TypeScript example
interface DealUpdateRequest {
  // ... existing fields ...
  label?: string | null;
  source?: string | null;
}
```

### 4. Update API Endpoints

Ensure your create and update endpoints accept and persist these new fields:

- `POST /api/deals` - Should accept `label` and `source` in request body
- `PUT /api/deals/:id` - Should accept `label` and `source` in request body
- `GET /api/deals` - Should return `label` and `source` in response
- `GET /api/deals/:id` - Should return `label` and `source` in response

### 5. Validation (Recommended)

Add validation for the label field to ensure only allowed values are accepted:

```typescript
// TypeScript/Express example
const validLabels = ['DIRECT', 'DIVERT', 'DESTINATION', 'PARTY MAKEUP', 'PRE WEDDING'];

if (dealData.label && !validLabels.includes(dealData.label)) {
  throw new Error('Invalid label value');
}
```

```java
// Java/Spring Boot example
@Pattern(regexp = "DIRECT|DIVERT|DESTINATION|PARTY MAKEUP|PRE WEDDING", 
         message = "Label must be one of: DIRECT, DIVERT, DESTINATION, PARTY MAKEUP, PRE WEDDING")
private String label;
```

## Frontend Integration

The frontend is already updated to send these fields. The payload structure is:

```json
{
  "name": "Deal Name",
  "status": "IN_PROGRESS",
  "value": 10000,
  "label": "DIRECT",
  "source": "Website Referral",
  // ... other fields ...
}
```

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Deal creation with label and source works
- [ ] Deal creation without label and source works (should be optional)
- [ ] Deal update with label and source works
- [ ] Invalid label values are rejected
- [ ] API returns label and source in GET responses
- [ ] Existing deals without label/source still work (backward compatibility)

## Rollback Plan

If you need to rollback these changes:

```sql
-- Remove columns
ALTER TABLE deals DROP COLUMN IF EXISTS label;
ALTER TABLE deals DROP COLUMN IF EXISTS source;

-- Remove constraints
ALTER TABLE deals DROP CONSTRAINT IF EXISTS chk_deal_label;

-- Remove indexes
DROP INDEX IF EXISTS idx_deals_label;
DROP INDEX IF EXISTS idx_deals_source;
```

## Notes

- Both fields are optional, so existing deals will have `NULL` values for these fields
- The label field should ideally be an enum in the database for data integrity
- Consider adding these fields to any deal filtering/search functionality
- Consider adding these fields to deal export/reporting features

