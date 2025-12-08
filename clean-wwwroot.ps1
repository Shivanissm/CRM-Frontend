# PowerShell script to clean wwwroot and keep only assets/, index.html, web.config
# This script removes ALL files/folders except the 3 we need

$wwwroot = "C:\home\site\wwwroot"

Write-Host "=========================================="
Write-Host "CLEANING WWWROOT - Keeping only 3 files"
Write-Host "=========================================="
Write-Host "Target: $wwwroot"

if (Test-Path $wwwroot) {
    Write-Host "Current contents:"
    Get-ChildItem $wwwroot | Select-Object Name | Format-Table
    
    Write-Host "Removing ALL files/folders except: assets/, index.html, web.config"
    
    # Get all items
    $items = Get-ChildItem $wwwroot -Force
    
    foreach ($item in $items) {
        $shouldKeep = $false
        
        # Check if this is one of our 3 items
        if ($item.Name -eq "assets" -and $item.PSIsContainer) {
            $shouldKeep = $true
        }
        elseif ($item.Name -eq "index.html" -and -not $item.PSIsContainer) {
            $shouldKeep = $true
        }
        elseif ($item.Name -eq "web.config" -and -not $item.PSIsContainer) {
            $shouldKeep = $true
        }
        
        # Remove if not in our keep list
        if (-not $shouldKeep) {
            Write-Host "Removing: $($item.Name)"
            try {
                Remove-Item $item.FullName -Recurse -Force -ErrorAction Stop
            }
            catch {
                Write-Host "Error removing $($item.Name): $_"
            }
        }
        else {
            Write-Host "Keeping: $($item.Name)"
        }
    }
    
    Write-Host ""
    Write-Host "Final contents:"
    Get-ChildItem $wwwroot | Select-Object Name | Format-Table
    
    $fileCount = (Get-ChildItem $wwwroot -File).Count
    $dirCount = (Get-ChildItem $wwwroot -Directory).Count
    
    Write-Host "wwwroot now contains: $dirCount directories, $fileCount files"
    Write-Host "Expected: 1 directory (assets), 2 files (index.html, web.config)"
}
else {
    Write-Host "wwwroot directory does not exist!"
}

