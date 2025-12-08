# Deal Stage Duration Tracking - Backend Integration Guide

## Overview
This document outlines the backend changes required to track how many days a deal has been in each stage of a pipeline. This information will be used to display stage duration indicators in the frontend (e.g., "0 days", "5 days") similar to the Kanban board view.

## Database Schema Changes

### 1. Create `deal_stage_history` Table

Create a new table to track when a deal enters and exits each stage:

```sql
CREATE TABLE deal_stage_history (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    deal_id BIGINT NOT NULL,
    stage_id BIGINT NOT NULL,
    entered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    exited_at TIMESTAMP NULL,
    days_in_stage INT NULL, -- Calculated when deal exits the stage
    is_current BOOLEAN DEFAULT FALSE, -- True for the current stage
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (deal_id) REFERENCES deal(id) ON DELETE CASCADE,
    FOREIGN KEY (stage_id) REFERENCES stage(id) ON DELETE CASCADE,
    
    INDEX idx_deal_id (deal_id),
    INDEX idx_stage_id (stage_id),
    INDEX idx_is_current (is_current),
    INDEX idx_deal_stage (deal_id, stage_id)
);
```

### 2. Entity Class (Java/Spring Boot)

```java
package com.brideside.crm.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Table(name = "deal_stage_history")
@Data
public class DealStageHistory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "deal_id", nullable = false)
    private Deal deal;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "stage_id", nullable = false)
    private Stage stage;

    @Column(name = "entered_at", nullable = false)
    private LocalDateTime enteredAt;

    @Column(name = "exited_at")
    private LocalDateTime exitedAt;

    @Column(name = "days_in_stage")
    private Integer daysInStage;

    @Column(name = "is_current", nullable = false)
    private Boolean isCurrent = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
```

### 3. Repository Interface

```java
package com.brideside.crm.repository;

import com.brideside.crm.entity.DealStageHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DealStageHistoryRepository extends JpaRepository<DealStageHistory, Long> {
    
    // Find current stage history for a deal
    Optional<DealStageHistory> findByDealIdAndIsCurrentTrue(Long dealId);
    
    // Find all stage history for a deal, ordered by entered_at
    List<DealStageHistory> findByDealIdOrderByEnteredAtAsc(Long dealId);
    
    // Find stage history for a specific deal and stage
    List<DealStageHistory> findByDealIdAndStageIdOrderByEnteredAtAsc(Long dealId, Long stageId);
    
    // Find all current stages (for deals currently in a stage)
    List<DealStageHistory> findByIsCurrentTrue();
}
```

### 4. Service Layer - Stage History Management

```java
package com.brideside.crm.service;

import com.brideside.crm.entity.Deal;
import com.brideside.crm.entity.DealStageHistory;
import com.brideside.crm.entity.Stage;
import com.brideside.crm.repository.DealStageHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class DealStageHistoryService {
    
    private final DealStageHistoryRepository historyRepository;
    
    /**
     * Record when a deal enters a new stage
     * This should be called whenever a deal's stage is updated
     */
    @Transactional
    public void recordStageEntry(Deal deal, Stage newStage) {
        // Mark previous current stage as exited
        Optional<DealStageHistory> previousCurrent = 
            historyRepository.findByDealIdAndIsCurrentTrue(deal.getId());
        
        if (previousCurrent.isPresent()) {
            DealStageHistory previous = previousCurrent.get();
            LocalDateTime now = LocalDateTime.now();
            previous.setExitedAt(now);
            previous.setIsCurrent(false);
            
            // Calculate days in stage
            if (previous.getEnteredAt() != null) {
                long days = ChronoUnit.DAYS.between(previous.getEnteredAt(), now);
                previous.setDaysInStage((int) days);
            }
            
            historyRepository.save(previous);
        }
        
        // Create new entry for current stage
        DealStageHistory newEntry = new DealStageHistory();
        newEntry.setDeal(deal);
        newEntry.setStage(newStage);
        newEntry.setEnteredAt(LocalDateTime.now());
        newEntry.setIsCurrent(true);
        
        historyRepository.save(newEntry);
        
        log.info("Recorded stage entry: Deal {} entered stage {} at {}", 
            deal.getId(), newStage.getId(), newEntry.getEnteredAt());
    }
    
    /**
     * Get days a deal has been in a specific stage
     * Returns 0 if deal has never been in that stage
     */
    public int getDaysInStage(Long dealId, Long stageId) {
        List<DealStageHistory> histories = 
            historyRepository.findByDealIdAndStageIdOrderByEnteredAtAsc(dealId, stageId);
        
        if (histories.isEmpty()) {
            return 0; // Deal has never been in this stage
        }
        
        // Check if currently in this stage
        Optional<DealStageHistory> current = histories.stream()
            .filter(DealStageHistory::getIsCurrent)
            .findFirst();
        
        if (current.isPresent()) {
            // Calculate days from entry to now
            DealStageHistory currentHistory = current.get();
            LocalDateTime enteredAt = currentHistory.getEnteredAt();
            LocalDateTime now = LocalDateTime.now();
            return (int) ChronoUnit.DAYS.between(enteredAt, now);
        }
        
        // Deal was in this stage before, return the last recorded days
        DealStageHistory lastHistory = histories.get(histories.size() - 1);
        return lastHistory.getDaysInStage() != null ? lastHistory.getDaysInStage() : 0;
    }
    
    /**
     * Get days a deal has been in its current stage
     */
    public int getDaysInCurrentStage(Long dealId) {
        Optional<DealStageHistory> current = 
            historyRepository.findByDealIdAndIsCurrentTrue(dealId);
        
        if (current.isEmpty()) {
            return 0;
        }
        
        DealStageHistory currentHistory = current.get();
        LocalDateTime enteredAt = currentHistory.getEnteredAt();
        LocalDateTime now = LocalDateTime.now();
        return (int) ChronoUnit.DAYS.between(enteredAt, now);
    }
    
    /**
     * Get all stage durations for a deal
     * Returns a map of stageId -> days
     */
    public Map<Long, Integer> getAllStageDurations(Long dealId) {
        List<DealStageHistory> histories = 
            historyRepository.findByDealIdOrderByEnteredAtAsc(dealId);
        
        Map<Long, Integer> durations = new HashMap<>();
        
        for (DealStageHistory history : histories) {
            Long stageId = history.getStage().getId();
            
            if (history.getIsCurrent()) {
                // Calculate current days
                LocalDateTime enteredAt = history.getEnteredAt();
                LocalDateTime now = LocalDateTime.now();
                int days = (int) ChronoUnit.DAYS.between(enteredAt, now);
                durations.put(stageId, days);
            } else if (history.getDaysInStage() != null) {
                // Use recorded days
                durations.put(stageId, history.getDaysInStage());
            } else {
                // Calculate if not recorded
                if (history.getExitedAt() != null) {
                    long days = ChronoUnit.DAYS.between(history.getEnteredAt(), history.getExitedAt());
                    durations.put(stageId, (int) days);
                }
            }
        }
        
        return durations;
    }
}
```

### 5. Update Deal Service to Track Stage Changes

Modify your existing `DealService` to call the history service when a deal's stage changes:

```java
@Service
@RequiredArgsConstructor
public class DealService {
    
    private final DealRepository dealRepository;
    private final DealStageHistoryService stageHistoryService;
    private final StageRepository stageRepository;
    
    @Transactional
    public Deal moveToStage(Long dealId, Long stageId) {
        Deal deal = dealRepository.findById(dealId)
            .orElseThrow(() -> new EntityNotFoundException("Deal not found"));
        
        Stage newStage = stageRepository.findById(stageId)
            .orElseThrow(() -> new EntityNotFoundException("Stage not found"));
        
        Long oldStageId = deal.getStageId();
        
        // Update deal stage
        deal.setStageId(stageId);
        Deal updatedDeal = dealRepository.save(deal);
        
        // Record stage change in history
        if (oldStageId == null || !oldStageId.equals(stageId)) {
            stageHistoryService.recordStageEntry(updatedDeal, newStage);
        }
        
        return updatedDeal;
    }
}
```

### 6. API Endpoint - Get Stage Durations for a Deal

```java
package com.brideside.crm.controller;

import com.brideside.crm.service.DealStageHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/deals")
@RequiredArgsConstructor
public class DealController {
    
    private final DealStageHistoryService stageHistoryService;
    
    /**
     * GET /api/deals/{dealId}/stage-durations
     * Get days a deal has been in each stage
     */
    @GetMapping("/{dealId}/stage-durations")
    public ResponseEntity<Map<Long, Integer>> getStageDurations(@PathVariable Long dealId) {
        Map<Long, Integer> durations = stageHistoryService.getAllStageDurations(dealId);
        return ResponseEntity.ok(durations);
    }
    
    /**
     * GET /api/deals/{dealId}/current-stage-duration
     * Get days a deal has been in its current stage
     */
    @GetMapping("/{dealId}/current-stage-duration")
    public ResponseEntity<Integer> getCurrentStageDuration(@PathVariable Long dealId) {
        int days = stageHistoryService.getDaysInCurrentStage(dealId);
        return ResponseEntity.ok(days);
    }
}
```

### 7. DTO for Stage Duration Response (Optional)

```java
package com.brideside.crm.dto;

import lombok.Data;
import java.util.Map;

@Data
public class DealStageDurationsResponse {
    private Long dealId;
    private Map<Long, Integer> stageDurations; // stageId -> days
    private Integer currentStageDuration;
    private Long currentStageId;
}
```

## Migration Strategy

### For Existing Deals

You'll need to backfill stage history for existing deals. Create a migration script:

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class DealStageHistoryMigrationService {
    
    private final DealRepository dealRepository;
    private final DealStageHistoryRepository historyRepository;
    private final DealStageHistoryService stageHistoryService;
    
    @Transactional
    public void migrateExistingDeals() {
        List<Deal> deals = dealRepository.findAll();
        
        for (Deal deal : deals) {
            if (deal.getStageId() != null) {
                // Create initial history entry for current stage
                // Use deal.createdAt as entered_at if available
                DealStageHistory history = new DealStageHistory();
                history.setDeal(deal);
                history.setStage(deal.getStage());
                history.setEnteredAt(deal.getCreatedAt() != null ? 
                    deal.getCreatedAt() : LocalDateTime.now());
                history.setIsCurrent(true);
                historyRepository.save(history);
                
                log.info("Migrated deal {} to stage history", deal.getId());
            }
        }
    }
}
```

## API Response Format

### GET /api/deals/{dealId}/stage-durations

**Response:**
```json
{
  "1": 5,   // Stage ID 1: 5 days
  "2": 3,   // Stage ID 2: 3 days
  "3": 0    // Stage ID 3: 0 days (current stage, just entered)
}
```

### GET /api/deals/{dealId}/current-stage-duration

**Response:**
```json
0
```

## Frontend Integration

The frontend will call these endpoints to display stage duration information. The response format is a simple map of `stageId -> days`, which makes it easy to display "X days" indicators for each stage.

## Notes

1. **Performance**: Consider adding indexes on `deal_id`, `stage_id`, and `is_current` for efficient queries.

2. **Data Integrity**: The `is_current` flag ensures only one active stage history per deal. The service layer enforces this.

3. **Time Zone**: Use `LocalDateTime` or `ZonedDateTime` based on your application's timezone requirements.

4. **Calculations**: Days are calculated using `ChronoUnit.DAYS.between()`, which counts calendar days, not business days.

5. **Edge Cases**: 
   - If a deal is moved to the same stage, no new history entry is created
   - If a deal is created with a stage, the first history entry uses `deal.createdAt` as `entered_at`
   - If a deal's stage is set to null, mark the current history as exited

6. **Cleanup**: Consider archiving old stage history records periodically if the table grows too large.

