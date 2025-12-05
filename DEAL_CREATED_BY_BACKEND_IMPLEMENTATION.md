# Deal Created By Backend Implementation

## Overview
This document describes the backend implementation required to track who created a deal (user vs bot) and ensure activities are only created by the appropriate source to prevent duplicates.

## Database Schema Changes

### Add Columns to `deals` Table

```sql
ALTER TABLE deals 
ADD COLUMN created_by VARCHAR(10) DEFAULT 'USER' CHECK (created_by IN ('USER', 'BOT')),
ADD COLUMN created_by_user_id INTEGER NULL,
ADD COLUMN created_by_name VARCHAR(255) NULL;

-- Add foreign key constraint for created_by_user_id
ALTER TABLE deals 
ADD CONSTRAINT fk_deals_created_by_user 
FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX idx_deals_created_by ON deals(created_by);
CREATE INDEX idx_deals_created_by_user_id ON deals(created_by_user_id);
```

## Entity Changes

### Update `Deal` Entity (Java/Spring Boot)

```java
@Entity
@Table(name = "deals")
public class Deal {
    // ... existing fields ...
    
    @Column(name = "created_by", length = 10)
    @Enumerated(EnumType.STRING)
    private CreatedByType createdBy = CreatedByType.USER;
    
    @Column(name = "created_by_user_id")
    private Long createdByUserId;
    
    @Column(name = "created_by_name", length = 255)
    private String createdByName;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", insertable = false, updatable = false)
    private User createdByUser;
    
    // Getters and setters
    public CreatedByType getCreatedBy() {
        return createdBy;
    }
    
    public void setCreatedBy(CreatedByType createdBy) {
        this.createdBy = createdBy;
    }
    
    public Long getCreatedByUserId() {
        return createdByUserId;
    }
    
    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }
    
    public String getCreatedByName() {
        return createdByName;
    }
    
    public void setCreatedByName(String createdByName) {
        this.createdByName = createdByName;
    }
    
    public User getCreatedByUser() {
        return createdByUser;
    }
    
    public void setCreatedByUser(User createdByUser) {
        this.createdByUser = createdByUser;
    }
}

// Enum for CreatedByType
public enum CreatedByType {
    USER,
    BOT
}
```

## DTO Changes

### Update `DealCreateRequest` DTO

```java
public class DealCreateRequest {
    // ... existing fields ...
    
    @Enumerated(EnumType.STRING)
    private CreatedByType createdBy;
    
    private Long createdByUserId;
    
    // Getters and setters
    public CreatedByType getCreatedBy() {
        return createdBy;
    }
    
    public void setCreatedBy(CreatedByType createdBy) {
        this.createdBy = createdBy;
    }
    
    public Long getCreatedByUserId() {
        return createdByUserId;
    }
    
    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }
}
```

### Update `DealResponse` DTO

```java
public class DealResponse {
    // ... existing fields ...
    
    private CreatedByType createdBy;
    
    private Long createdByUserId;
    
    private String createdByName;
    
    // Getters and setters
    public CreatedByType getCreatedBy() {
        return createdBy;
    }
    
    public void setCreatedBy(CreatedByType createdBy) {
        this.createdBy = createdBy;
    }
    
    public Long getCreatedByUserId() {
        return createdByUserId;
    }
    
    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }
    
    public String getCreatedByName() {
        return createdByName;
    }
    
    public void setCreatedByName(String createdByName) {
        this.createdByName = createdByName;
    }
}
```

## Service Layer Changes

### Update `DealService` - Create Deal Method

```java
@Service
@Transactional
public class DealService {
    
    @Autowired
    private DealRepository dealRepository;
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private DealActivityService dealActivityService;
    
    public Deal createDeal(DealCreateRequest request, Authentication authentication) {
        Deal deal = new Deal();
        // ... map existing fields from request ...
        
        // Set createdBy information
        if (request.getCreatedBy() != null) {
            deal.setCreatedBy(request.getCreatedBy());
        } else {
            // Default to USER if not specified
            deal.setCreatedBy(CreatedByType.USER);
        }
        
        // If created by USER, get user info from authentication
        if (deal.getCreatedBy() == CreatedByType.USER) {
            if (authentication != null && authentication.getPrincipal() instanceof UserDetails) {
                String username = ((UserDetails) authentication.getPrincipal()).getUsername();
                User user = userRepository.findByEmail(username)
                    .orElseThrow(() -> new RuntimeException("User not found"));
                deal.setCreatedByUserId(user.getId());
                deal.setCreatedByName(user.getFirstName() + " " + user.getLastName());
            } else if (request.getCreatedByUserId() != null) {
                // Fallback: use provided user ID
                User user = userRepository.findById(request.getCreatedByUserId())
                    .orElseThrow(() -> new RuntimeException("User not found"));
                deal.setCreatedByUserId(user.getId());
                deal.setCreatedByName(user.getFirstName() + " " + user.getLastName());
            }
        } else if (deal.getCreatedBy() == CreatedByType.BOT) {
            // For bot-created deals, set createdByUserId to null
            deal.setCreatedByUserId(null);
            deal.setCreatedByName(null);
        }
        
        Deal savedDeal = dealRepository.save(deal);
        
        // Create activities ONLY if created by BOT
        // Frontend will handle activity creation for USER-created deals
        if (savedDeal.getCreatedBy() == CreatedByType.BOT) {
            // Check if deal is in Qualified stage and create activities
            if (savedDeal.getStageId() != null) {
                dealActivityService.createQualifiedStageActivitiesIfNeeded(savedDeal);
            }
        }
        
        return savedDeal;
    }
    
    public Deal updateDeal(Long id, DealUpdateRequest request) {
        Deal deal = dealRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Deal not found"));
        
        // ... update existing fields ...
        
        // NOTE: createdBy fields should NOT be updated after creation
        // They are immutable once set
        
        return dealRepository.save(deal);
    }
    
    public Deal moveDealToStage(Long dealId, Long stageId, Authentication authentication) {
        Deal deal = dealRepository.findById(dealId)
            .orElseThrow(() -> new RuntimeException("Deal not found"));
        
        Stage newStage = stageRepository.findById(stageId)
            .orElseThrow(() -> new RuntimeException("Stage not found"));
        
        Stage oldStage = deal.getStageId() != null 
            ? stageRepository.findById(deal.getStageId()).orElse(null)
            : null;
        
        deal.setStageId(stageId);
        Deal updatedDeal = dealRepository.save(deal);
        
        // Create activities ONLY if:
        // 1. Deal was created by BOT (backend handles it)
        // 2. Deal moved to Qualified stage
        // 3. Deal was NOT created by USER (frontend will handle it)
        if (updatedDeal.getCreatedBy() == CreatedByType.BOT) {
            Pipeline pipeline = pipelineRepository.findById(updatedDeal.getPipelineId())
                .orElse(null);
            if (pipeline != null) {
                Stage qualifiedStage = pipeline.getStages().stream()
                    .filter(s -> "qualified".equalsIgnoreCase(s.getName().trim()))
                    .findFirst()
                    .orElse(null);
                
                if (qualifiedStage != null && newStage.getId().equals(qualifiedStage.getId())) {
                    // Only create if moving forward (not backward)
                    if (oldStage == null || newStage.getOrder() > oldStage.getOrder()) {
                        // IMPORTANT: This must be called synchronously to ensure activities are created immediately
                        try {
                            dealActivityService.createQualifiedStageActivitiesIfNeeded(updatedDeal);
                            log.info("Activity creation completed for BOT-created deal {} after stage update", updatedDeal.getId());
                        } catch (Exception e) {
                            log.error("Failed to create activities for BOT-created deal {} after stage update: {}", updatedDeal.getId(), e.getMessage(), e);
                            // Don't fail stage update if activity creation fails
                        }
                    }
                }
            }
        }
        // If created by USER, frontend will handle activity creation via API call
        
        return updatedDeal;
    }
}
```

## Instagram Bot Integration

### When Bot Creates Deal

```java
@Service
public class InstagramBotService {
    
    @Autowired
    private DealService dealService;
    
    @Autowired
    private PersonService personService;
    
    public Deal createDealFromInstagramMessage(InstagramMessage message) {
        // Create person first
        Person person = personService.createPersonFromInstagram(message);
        
        // Create deal
        DealCreateRequest dealRequest = new DealCreateRequest();
        dealRequest.setName(message.getDealName());
        dealRequest.setPersonId(person.getId());
        dealRequest.setPipelineId(getDefaultPipelineId());
        dealRequest.setStageId(getLeadInStageId());
        // ... set other fields ...
        
        // IMPORTANT: Set createdBy to BOT
        dealRequest.setCreatedBy(CreatedByType.BOT);
        
        // Create deal (no authentication needed for bot)
        Deal deal = dealService.createDeal(dealRequest, null);
        
        // When phone number is added later, move to Qualified stage
        // This will trigger activity creation in moveDealToStage method
        if (person.getPhone() != null && !person.getPhone().trim().isEmpty()) {
            Stage qualifiedStage = getQualifiedStage(deal.getPipelineId());
            if (qualifiedStage != null) {
                dealService.moveDealToStage(deal.getId(), qualifiedStage.getId(), null);
            }
        }
        
        return deal;
    }
}
```

## Activity Creation Logic Update

### Update `DealActivityService`

```java
@Service
@Transactional
public class DealActivityService {
    
    @Autowired
    private ActivityRepository activityRepository;
    
    @Autowired
    private PipelineRepository pipelineRepository;
    
    @Autowired
    private TeamRepository teamRepository;
    
    @Autowired
    private OrganizationRepository organizationRepository;
    
    @Autowired
    private PersonRepository personRepository;
    
    @Autowired
    private UserRepository userRepository;
    
    /**
     * Creates activities for a deal in Qualified stage.
     * This method should ONLY be called for BOT-created deals.
     * Frontend handles activity creation for USER-created deals.
     */
    public void createQualifiedStageActivitiesIfNeeded(Deal deal) {
        // Double-check: Only create for BOT-created deals
        if (deal.getCreatedBy() != CreatedByType.BOT) {
            log.warn("Skipping activity creation for deal {} - not created by BOT", deal.getId());
            return;
        }
        
        // Check if person has phone number
        Person person = personRepository.findById(deal.getPersonId()).orElse(null);
        if (person == null || person.getPhone() == null || person.getPhone().trim().isEmpty()) {
            log.info("Skipping activity creation for deal {} - person has no phone number", deal.getId());
            return;
        }
        
        // Check for existing activities
        List<Activity> existingActivities = activityRepository.findByDealId(deal.getId());
        boolean hasMakeFirstCall = existingActivities.stream()
            .anyMatch(a -> "Make first call".equals(a.getSubject()) 
                && a.getDealId() != null && a.getDealId().equals(deal.getId()));
        boolean hasSendQuotes = existingActivities.stream()
            .anyMatch(a -> "Send Quotes".equals(a.getSubject()) 
                && a.getDealId() != null && a.getDealId().equals(deal.getId()));
        
        if (hasMakeFirstCall && hasSendQuotes) {
            log.info("Activities already exist for deal {}, skipping creation", deal.getId());
            return;
        }
        
        // Get team manager from pipeline
        Pipeline pipeline = pipelineRepository.findById(deal.getPipelineId()).orElse(null);
        if (pipeline == null) {
            log.error("Pipeline not found for deal {} - cannot assign activities", deal.getId());
            return;
        }
        
        Long assignedUserId = null;
        String assignedUserName = "Unassigned";
        
        // Try to get team manager from pipeline's team
        if (pipeline.getTeamId() != null) {
            Team team = teamRepository.findById(pipeline.getTeamId()).orElse(null);
            if (team != null) {
                if (team.getManager() != null) {
                    User teamManager = team.getManager();
                    assignedUserId = teamManager.getId();
                    assignedUserName = teamManager.getFirstName() + " " + teamManager.getLastName();
                    log.info("Found team manager for deal {}: {} (ID: {})", deal.getId(), assignedUserName, assignedUserId);
                } else {
                    log.warn("Team {} has no manager for deal {}", team.getId(), deal.getId());
                }
            } else {
                log.warn("Team {} not found for pipeline {} (deal {})", pipeline.getTeamId(), pipeline.getId(), deal.getId());
            }
        } else {
            log.warn("Pipeline {} has no teamId for deal {}", pipeline.getId(), deal.getId());
        }
        
        // FALLBACK 1: Try to use deal owner if team manager not found
        if (assignedUserId == null && deal.getOwnerId() != null) {
            User dealOwner = userRepository.findById(deal.getOwnerId()).orElse(null);
            if (dealOwner != null) {
                assignedUserId = dealOwner.getId();
                assignedUserName = dealOwner.getFirstName() + " " + dealOwner.getLastName();
                log.info("Using deal owner as fallback for deal {}: {} (ID: {})", deal.getId(), assignedUserName, assignedUserId);
            }
        }
        
        // FALLBACK 2: Try to use organization owner if deal owner not found
        if (assignedUserId == null && deal.getOrganizationId() != null) {
            Organization organization = organizationRepository.findById(deal.getOrganizationId()).orElse(null);
            if (organization != null && organization.getOwnerId() != null) {
                User orgOwner = userRepository.findById(organization.getOwnerId()).orElse(null);
                if (orgOwner != null) {
                    assignedUserId = orgOwner.getId();
                    assignedUserName = orgOwner.getFirstName() + " " + orgOwner.getLastName();
                    log.info("Using organization owner as fallback for deal {}: {} (ID: {})", deal.getId(), assignedUserName, assignedUserId);
                }
            }
        }
        
        // CRITICAL: If still no user assigned, log error and DO NOT create activities
        // Activities without assignedUserId will not show up properly in the UI
        if (assignedUserId == null) {
            log.error("CRITICAL: Cannot assign activities for deal {} - no team manager, deal owner, or organization owner found. Pipeline: {}, Team: {}, Deal Owner: {}, Organization: {}", 
                deal.getId(), 
                pipeline.getId(), 
                pipeline.getTeamId(), 
                deal.getOwnerId(), 
                deal.getOrganizationId());
            // Option 1: Don't create activities (recommended)
            return;
            
            // Option 2: Create activities unassigned (not recommended, but uncomment if needed)
            // log.warn("Creating activities unassigned for deal {}", deal.getId());
        }
        
        // Get organization
        Organization organization = null;
        if (deal.getOrganizationId() != null) {
            organization = organizationRepository.findById(deal.getOrganizationId()).orElse(null);
        }
        
        // Calculate tomorrow's date
        LocalDate tomorrow = LocalDate.now().plusDays(1);
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        String tomorrowStr = tomorrow.format(formatter);
        
        // Create "Make first call" activity
        if (!hasMakeFirstCall) {
            Activity makeFirstCall = new Activity();
            makeFirstCall.setSubject("Make first call");
            makeFirstCall.setCategory("Call");
            makeFirstCall.setDealId(deal.getId());
            makeFirstCall.setPersonId(deal.getPersonId());
            makeFirstCall.setOrganizationId(deal.getOrganizationId());
            makeFirstCall.setOrganization(organization != null ? organization.getName() : null);
            makeFirstCall.setAssignedUser(assignedUserName);
            makeFirstCall.setAssignedUserId(assignedUserId);
            makeFirstCall.setDate(tomorrowStr);
            makeFirstCall.setDone(false);
            activityRepository.save(makeFirstCall);
        }
        
        // Create "Send Quotes" activity
        if (!hasSendQuotes) {
            Activity sendQuotes = new Activity();
            sendQuotes.setSubject("Send Quotes");
            sendQuotes.setCategory("Activity");
            sendQuotes.setDealId(deal.getId());
            sendQuotes.setPersonId(deal.getPersonId());
            sendQuotes.setOrganizationId(deal.getOrganizationId());
            sendQuotes.setOrganization(organization != null ? organization.getName() : null);
            sendQuotes.setAssignedUser(assignedUserName);
            sendQuotes.setAssignedUserId(assignedUserId);
            sendQuotes.setDate(tomorrowStr);
            sendQuotes.setDone(false);
            activityRepository.save(sendQuotes);
        }
    }
}
```

## API Endpoint Updates

### Update Deal Creation Endpoint

```java
@RestController
@RequestMapping("/api/deals")
public class DealController {
    
    @Autowired
    private DealService dealService;
    
    @PostMapping
    public ResponseEntity<DealResponse> createDeal(
            @RequestBody DealCreateRequest request,
            Authentication authentication) {
        Deal deal = dealService.createDeal(request, authentication);
        DealResponse response = mapToResponse(deal);
        return ResponseEntity.ok(response);
    }
    
    @PutMapping("/{id}/stage")
    public ResponseEntity<DealResponse> moveDealToStage(
            @PathVariable Long id,
            @RequestBody DealStageUpdateRequest request,
            Authentication authentication) {
        Deal deal = dealService.moveDealToStage(id, request.getStageId(), authentication);
        DealResponse response = mapToResponse(deal);
        return ResponseEntity.ok(response);
    }
}
```

## Migration Script

```sql
-- Migration: Add created_by fields to deals table
-- Date: YYYY-MM-DD

BEGIN;

-- Add columns
ALTER TABLE deals 
ADD COLUMN IF NOT EXISTS created_by VARCHAR(10) DEFAULT 'USER' CHECK (created_by IN ('USER', 'BOT')),
ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER NULL,
ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255) NULL;

-- Set default values for existing records
UPDATE deals 
SET created_by = 'USER' 
WHERE created_by IS NULL;

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_deals_created_by_user'
    ) THEN
        ALTER TABLE deals 
        ADD CONSTRAINT fk_deals_created_by_user 
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_deals_created_by ON deals(created_by);
CREATE INDEX IF NOT EXISTS idx_deals_created_by_user_id ON deals(created_by_user_id);

COMMIT;
```

## Troubleshooting

### Issue: Activities are created but `assigned_user_id` is NULL

**Symptoms:**
- Activities are created when deal moves to Qualified stage
- Activities appear in database but `assigned_user_id` column is NULL
- Activities don't show up properly in UI

**Possible Causes:**
1. Pipeline has no `teamId` set
2. Team has no manager assigned
3. Deal has no `ownerId` set
4. Organization has no `ownerId` set
5. Code is not properly setting `assignedUserId` before saving

**Debugging Steps:**
1. Check logs for warnings/errors about missing team manager
2. Verify pipeline has `teamId`: `SELECT id, name, team_id FROM pipelines WHERE id = ?`
3. Verify team has manager: `SELECT id, name, manager_id FROM teams WHERE id = ?`
4. Verify deal has owner: `SELECT id, name, owner_id FROM deals WHERE id = ?`
5. Verify organization has owner: `SELECT id, name, owner_id FROM organizations WHERE id = ?`
6. Check activity creation logs to see which fallback was used

**Solution:**
- Ensure at least one of the following is set:
  - Pipeline → Team → Manager
  - Deal → Owner
  - Deal → Organization → Owner
- Add proper logging to track which user is being assigned
- Verify `assignedUserId` is set before calling `activityRepository.save()`

### Issue: Activities are not created until frontend is opened

**Symptoms:**
- Bot creates deal and moves to Qualified stage
- Activities are not created immediately
- Activities only appear after opening the deal in frontend

**Possible Causes:**
1. Activity creation is only triggered by frontend API call
2. Backend is not calling `createQualifiedStageActivitiesIfNeeded()` when deal moves to Qualified
3. Transaction is not committed properly

**Solution:**
- Ensure `moveDealToStage()` method calls `createQualifiedStageActivitiesIfNeeded()` for BOT-created deals
- Verify the method is called synchronously (not async) to ensure activities are created immediately
- Check transaction boundaries - activities should be created in the same transaction as stage update

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Deal created from frontend has `created_by = 'USER'` and `created_by_user_id` set
- [ ] Deal created from bot has `created_by = 'BOT'` and `created_by_user_id = NULL`
- [ ] Activities are created by backend when bot creates deal and moves to Qualified
- [ ] Activities are NOT created by backend when user creates deal (frontend handles it)
- [ ] Frontend displays "Created By" section correctly
- [ ] Frontend shows bot icon for bot-created deals
- [ ] Frontend shows user name for user-created deals
- [ ] No duplicate activities are created

## Summary

1. **Database**: Add `created_by`, `created_by_user_id`, and `created_by_name` columns
2. **Entity**: Update `Deal` entity with new fields
3. **Service**: 
   - Set `createdBy = 'BOT'` when bot creates deal
   - Set `createdBy = 'USER'` when user creates deal (default)
   - Only create activities in backend for BOT-created deals
4. **Frontend**: Will handle activity creation for USER-created deals
5. **Result**: No duplicate activities, clear separation of responsibilities

