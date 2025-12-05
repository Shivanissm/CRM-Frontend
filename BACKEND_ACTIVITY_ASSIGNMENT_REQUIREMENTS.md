# Backend Activity Assignment Requirements

## Problem
When activities are created from the backend (e.g., via Instagram bot) when a deal moves from "Lead In" to "Qualified" stage, the activities are not being assigned to any user (`assigned_user_id` is null) and `organization_id` is also null.

## Frontend Implementation Reference
The frontend code in `src/pages/DealDetail.tsx` (function `createQualifiedStageActivities`) handles this correctly. The backend should replicate this logic.

## Required Logic for Backend

### 1. When to Create Activities
Create activities when:
- A deal moves from "Lead In" stage to "Qualified" stage
- The associated person has a phone number
- The activities "Make first call" and "Send Quotes" don't already exist for this deal

### 2. Activity Assignment Logic

#### Get Team Manager from Pipeline (with Fallbacks)
```java
// Pseudocode
Pipeline pipeline = getPipeline(deal.getPipelineId());
Long assignedUserId = null;
String assignedUserName = "Unassigned";

// PRIMARY: Try to get team manager from pipeline's team
if (pipeline.getTeamId() != null) {
    Team team = getTeam(pipeline.getTeamId());
    if (team != null && team.getManager() != null) {
        User teamManager = team.getManager();
        assignedUserId = teamManager.getId();
        assignedUserName = teamManager.getFirstName() + " " + teamManager.getLastName();
    }
}

// FALLBACK 1: Use deal owner if team manager not found
if (assignedUserId == null && deal.getOwnerId() != null) {
    User dealOwner = getUser(deal.getOwnerId());
    if (dealOwner != null) {
        assignedUserId = dealOwner.getId();
        assignedUserName = dealOwner.getFirstName() + " " + dealOwner.getLastName();
    }
}

// FALLBACK 2: Use organization owner if deal owner not found
if (assignedUserId == null && deal.getOrganizationId() != null) {
    Organization org = getOrganization(deal.getOrganizationId());
    if (org != null && org.getOwnerId() != null) {
        User orgOwner = getUser(org.getOwnerId());
        if (orgOwner != null) {
            assignedUserId = orgOwner.getId();
            assignedUserName = orgOwner.getFirstName() + " " + orgOwner.getLastName();
        }
    }
}

// CRITICAL: If still no user, log error and consider not creating activities
if (assignedUserId == null) {
    log.error("Cannot assign activities - no user found for deal {}", deal.getId());
    // Either return early (don't create activities) or create unassigned
    // Recommendation: Don't create activities without assignedUserId
    return;
}
```

#### Get Organization from Deal
```java
// Pseudocode
Organization organization = getOrganization(deal.getOrganizationId());
// Use organization.getId() as organizationId
// Use organization.getName() as organization (string field)
```

### 3. Activity Creation Payload

When creating each activity, include:

**For "Make first call" activity:**
```json
{
  "subject": "Make first call",
  "category": "Call",
  "dealId": <deal.id>,
  "personId": <deal.personId>,
  "organizationId": <deal.organizationId>,  // REQUIRED
  "organization": "<organization.name>",    // Optional but recommended
  "assignedUser": "<teamManager.firstName> <teamManager.lastName>",  // Optional but recommended
  "assignedUserId": <teamManager.id>,       // REQUIRED
  "date": "<tomorrow in DD/MM/YYYY format>",
  "done": false
}
```

**For "Send Quotes" activity:**
```json
{
  "subject": "Send Quotes",
  "category": "Activity",
  "dealId": <deal.id>,
  "personId": <deal.personId>,
  "organizationId": <deal.organizationId>,  // REQUIRED
  "organization": "<organization.name>",    // Optional but recommended
  "assignedUser": "<teamManager.firstName> <teamManager.lastName>",  // Optional but recommended
  "assignedUserId": <teamManager.id>,       // REQUIRED
  "date": "<tomorrow in DD/MM/YYYY format>",
  "done": false
}
```

### 4. Critical Fields

**MUST be set:**
- `assignedUserId` (number) - ID of the team manager from the pipeline's team
- `organizationId` (number) - ID from the deal's organization

**SHOULD be set:**
- `assignedUser` (string) - Full name of the team manager (for display purposes)
- `organization` (string) - Name of the organization (for display purposes)

### 5. Date Format
- Date should be in `DD/MM/YYYY` format
- Set to tomorrow's date (deal date + 1 day)

### 6. Error Handling

If team manager cannot be found:
- Log a warning
- Activities can still be created but will be unassigned
- Consider using a default user or the deal owner as fallback

If organization cannot be found:
- Log a warning
- Activities can still be created but `organizationId` will be null

### 7. Duplicate Prevention (CRITICAL)

**IMPORTANT:** Both frontend and backend can trigger activity creation. To prevent duplicates, you MUST check for existing activities before creating new ones.

**Check must be done BEFORE creating any activities:**
```java
// Pseudocode - MUST check for existing activities first
List<Activity> existingActivities = activityRepository.findByDealId(deal.getId());
boolean hasMakeFirstCall = existingActivities.stream()
    .anyMatch(a -> "Make first call".equals(a.getSubject()) && a.getDealId().equals(deal.getId()));
boolean hasSendQuotes = existingActivities.stream()
    .anyMatch(a -> "Send Quotes".equals(a.getSubject()) && a.getDealId().equals(deal.getId()));

// Only create activities that don't already exist
if (hasMakeFirstCall && hasSendQuotes) {
    // Both activities already exist, skip creation entirely
    log.info("Activities already exist for deal {}, skipping creation", deal.getId());
    return;
}

// Create only the missing activities
if (!hasMakeFirstCall) {
    // Create "Make first call" activity
}

if (!hasSendQuotes) {
    // Create "Send Quotes" activity
}
```

**Why this is critical:**
- Frontend creates activities when user moves deal via UI
- Backend creates activities when bot creates deal and moves to Qualified
- Without this check, both could create activities → duplicates
- The check should be done **atomically** or with proper locking if there's a race condition risk

## Example Backend Implementation (Java/Spring Boot)

```java
@Service
public class DealStageService {
    
    @Autowired
    private ActivityRepository activityRepository;
    
    @Autowired
    private PipelineRepository pipelineRepository;
    
    @Autowired
    private TeamRepository teamRepository;
    
    @Autowired
    private OrganizationRepository organizationRepository;
    
    @Autowired
    private UserRepository userRepository;
    
    public void createQualifiedStageActivities(Deal deal) {
        // 1. Get pipeline
        Pipeline pipeline = pipelineRepository.findById(deal.getPipelineId())
            .orElseThrow(() -> new RuntimeException("Pipeline not found"));
        
        // 2. Get team manager
        Long assignedUserId = null;
        String assignedUserName = "Unassigned";
        
        if (pipeline.getTeamId() != null) {
            Team team = teamRepository.findById(pipeline.getTeamId())
                .orElse(null);
            if (team != null && team.getManager() != null) {
                User teamManager = team.getManager();
                assignedUserId = teamManager.getId();
                assignedUserName = teamManager.getFirstName() + " " + teamManager.getLastName();
            }
        }
        
        // 3. Get organization
        Organization organization = null;
        if (deal.getOrganizationId() != null) {
            organization = organizationRepository.findById(deal.getOrganizationId())
                .orElse(null);
        }
        
        // 4. Check for existing activities (CRITICAL - prevents duplicates from frontend/backend race)
        List<Activity> existingActivities = activityRepository.findByDealId(deal.getId());
        boolean hasMakeFirstCall = existingActivities.stream()
            .anyMatch(a -> "Make first call".equals(a.getSubject()) 
                && a.getDealId() != null && a.getDealId().equals(deal.getId()));
        boolean hasSendQuotes = existingActivities.stream()
            .anyMatch(a -> "Send Quotes".equals(a.getSubject()) 
                && a.getDealId() != null && a.getDealId().equals(deal.getId()));
        
        // Only create activities that don't already exist
        // This prevents duplicates if frontend also tries to create them
        if (hasMakeFirstCall && hasSendQuotes) {
            log.info("Activities already exist for deal {}, skipping creation", deal.getId());
            return; // Activities already exist
        }
        
        // 5. Get person to check phone number
        Person person = personRepository.findById(deal.getPersonId())
            .orElse(null);
        
        if (person == null || person.getPhone() == null || person.getPhone().trim().isEmpty()) {
            return; // Person has no phone number
        }
        
        // 6. Calculate tomorrow's date
        LocalDate tomorrow = LocalDate.now().plusDays(1);
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        String tomorrowStr = tomorrow.format(formatter);
        
        // 7. Create "Make first call" activity (only if it doesn't exist)
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
        
        // 8. Create "Send Quotes" activity (only if it doesn't exist)
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

## Testing Checklist

- [ ] Activities are created with `assignedUserId` set to team manager's ID
- [ ] Activities are created with `organizationId` set to deal's organization ID
- [ ] **CRITICAL: Activities are not duplicated if they already exist**
  - [ ] Test: Backend creates activities, then frontend tries to create → no duplicates
  - [ ] Test: Frontend creates activities, then backend tries to create → no duplicates
  - [ ] Test: Both try to create simultaneously → no duplicates (race condition)
- [ ] Activities are not created if person has no phone number
- [ ] Date is set to tomorrow in DD/MM/YYYY format
- [ ] Works correctly when team manager is not found (handles gracefully)
- [ ] Works correctly when organization is not found (handles gracefully)

## Race Condition Prevention

**IMPORTANT:** Both frontend and backend can trigger activity creation. To prevent duplicates in race conditions:

### Option 1: Database-level constraint (RECOMMENDED)
Add a unique constraint on `(deal_id, subject)` in the activities table:
```sql
ALTER TABLE activities 
ADD CONSTRAINT unique_deal_subject UNIQUE (deal_id, subject);
```
This prevents duplicates at the database level, even if both frontend and backend try to create simultaneously.

### Option 2: Application-level locking
Use distributed lock (Redis, etc.) when creating activities:
```java
String lockKey = "activity_creation:deal:" + deal.getId();
if (distributedLock.tryLock(lockKey, 5, TimeUnit.SECONDS)) {
    try {
        // Check and create activities
    } finally {
        distributedLock.unlock(lockKey);
    }
}
```

### Option 3: Transaction with proper isolation
Wrap the check-and-create in a transaction with appropriate isolation level:
```java
@Transactional(isolation = Isolation.SERIALIZABLE)
public void createQualifiedStageActivities(Deal deal) {
    // Use SELECT FOR UPDATE when checking for existing activities
    List<Activity> existingActivities = activityRepository
        .findByDealIdForUpdate(deal.getId());
    // ... rest of the logic
}
```

**Recommendation:** Use Option 1 (database constraint) as it's the most reliable and simplest solution.

