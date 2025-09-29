# Save as "universal-project-scanner.ps1"
$folderName = Split-Path -Leaf (Get-Location)
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$outputFile = "$folderName-snapshot-$timestamp.txt"

# Auto-detect project type - initialize variables properly
$projectType = "Unknown"
$techStack = @()

# Node.js/JavaScript detection with proper Next.js upgrade
if (Test-Path "package.json") {
    $packageContent = Get-Content "package.json" -Raw
    
    # Set initial type
    $projectType = "Node.js/JavaScript"
    $techStack += "Node.js"
    
    # Check for Next.js FIRST and update project type immediately
    if ((Test-Path "pages") -and ($packageContent -match "next")) {
        $projectType = "Next.js Web App"
        $techStack += "Next.js"
    }
    
    # Add other technology detections
    if ($packageContent -match "ffmpeg") {
        $techStack += "Video Processing"
    }
    if ($packageContent -match "supabase") {
        $techStack += "Supabase Database"
    }
    if ($packageContent -match "react") {
        $techStack += "React"
    }
    if ($packageContent -match "tailwind") {
        $techStack += "Tailwind CSS"
    }
    
    # Additional folder-based detection
    if (Test-Path "src") { $techStack += "Frontend" }
    if (Test-Path "public") { $techStack += "Web App" }
}

# Python detection
if (Get-ChildItem -Filter "*.py" -File) {
    if ($projectType -eq "Unknown") { 
        $projectType = "Python" 
    } else { 
        $projectType = "Hybrid Python + $projectType" 
    }
    $techStack += "Python"
    
    if (Test-Path "requirements.txt") { $techStack += "pip" }
    if (Test-Path "app.py" -or (Get-ChildItem -Filter "*flask*" -File)) { $techStack += "Flask" }
    if (Get-ChildItem -Filter "*django*" -File) { $techStack += "Django" }
}

# Other language detections
if (Get-ChildItem -Filter "*.csproj" -File) {
    $projectType = "C#/.NET"
    $techStack += "C#", ".NET"
}

if (Test-Path "pom.xml") {
    $projectType = "Java/Maven"
    $techStack += "Java", "Maven"
}

if (Test-Path "Cargo.toml") {
    $projectType = "Rust"
    $techStack += "Rust", "Cargo"
}

# Generate output - project type should now be correctly set
@"
================================================================================
PROJECT SNAPSHOT: $folderName
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Location: $(Get-Location)
================================================================================

=== PROJECT OVERVIEW ===
Project Type: $projectType
Tech Stack: $($techStack -join ', ')
Folder: $folderName

=== DIRECTORY STRUCTURE ===
"@ | Out-File $outputFile

Get-ChildItem | Select-Object Name, Length, LastWriteTime | Format-Table | Out-String | Out-File $outputFile -Append

# Python files section
$pythonFiles = Get-ChildItem -Filter "*.py" -File
if ($pythonFiles) {
    "`n=== PYTHON FILES ===" | Out-File $outputFile -Append
    $pythonFiles | ForEach-Object {
        "`n--- PYTHON: $($_.Name) ($('{0:N0}' -f $_.Length) bytes) ---" | Out-File $outputFile -Append
        Get-Content $_.FullName | Out-File $outputFile -Append
    }
}

# Node.js/JavaScript section
if (Test-Path "package.json") {
    "`n=== PACKAGE.JSON ===" | Out-File $outputFile -Append
    Get-Content "package.json" | Out-File $outputFile -Append
    
    # Look for main JS/React files in src folder
    if (Test-Path "src") {
        "`n=== SOURCE FILES ===" | Out-File $outputFile -Append
        Get-ChildItem "src" -Recurse -Include "*.js", "*.jsx", "*.ts", "*.tsx" | ForEach-Object {
            "`n--- SOURCE: $($_.Name) ---" | Out-File $outputFile -Append
            Get-Content $_.FullName | Select-Object -First 50 | Out-File $outputFile -Append
            if ((Get-Content $_.FullName).Count -gt 50) {
                "... (file continues, $('{0:N0}' -f $_.Length) total bytes)" | Out-File $outputFile -Append
            }
        }
    }
    
    # Look for Next.js pages
    if (Test-Path "pages") {
        "`n=== NEXT.JS PAGES ===" | Out-File $outputFile -Append
        Get-ChildItem "pages" -Recurse -Include "*.js", "*.jsx", "*.ts", "*.tsx" | ForEach-Object {
            "`n--- PAGE: $($_.Name) ---" | Out-File $outputFile -Append
            Get-Content $_.FullName | Select-Object -First 50 | Out-File $outputFile -Append
            if ((Get-Content $_.FullName).Count -gt 50) {
                "... (file continues, $('{0:N0}' -f $_.Length) total bytes)" | Out-File $outputFile -Append
            }
        }
    }
}

# Other language sections
$csharpFiles = Get-ChildItem -Filter "*.cs" -File
if ($csharpFiles) {
    "`n=== C# FILES ===" | Out-File $outputFile -Append
    $csharpFiles | ForEach-Object {
        "`n--- C#: $($_.Name) ---" | Out-File $outputFile -Append
        Get-Content $_.FullName | Select-Object -First 50 | Out-File $outputFile -Append
    }
}

$javaFiles = Get-ChildItem -Filter "*.java" -File -Recurse
if ($javaFiles) {
    "`n=== JAVA FILES ===" | Out-File $outputFile -Append
    $javaFiles | ForEach-Object {
        "`n--- JAVA: $($_.Name) ---" | Out-File $outputFile -Append
        Get-Content $_.FullName | Select-Object -First 50 | Out-File $outputFile -Append
    }
}

# Configuration files
$configFiles = Get-ChildItem -Include "*.config", "*.ini", "*.yaml", "*.yml", "*.toml", "requirements.txt", "Dockerfile" -File
if ($configFiles) {
    "`n=== CONFIGURATION FILES ===" | Out-File $outputFile -Append
    $configFiles | ForEach-Object {
        "`n--- CONFIG: $($_.Name) ---" | Out-File $outputFile -Append
        Get-Content $_.FullName | Out-File $outputFile -Append
    }
}

# Documentation
$docFiles = Get-ChildItem -Include "README*", "*.md", "CHANGELOG*" -File
if ($docFiles) {
    "`n=== DOCUMENTATION ===" | Out-File $outputFile -Append
    $docFiles | ForEach-Object {
        "`n--- DOC: $($_.Name) ---" | Out-File $outputFile -Append
        Get-Content $_.FullName | Out-File $outputFile -Append
    }
}

# Project analysis and features
@"

=== PROJECT ANALYSIS ===
Total Files: $(Get-ChildItem -File -Recurse | Measure-Object | Select-Object -ExpandProperty Count)
Code Files: $(Get-ChildItem -Include "*.py", "*.js", "*.jsx", "*.cs", "*.java", "*.cpp", "*.c", "*.ts", "*.tsx" -File -Recurse | Measure-Object | Select-Object -ExpandProperty Count)
Project Size: $('{0:N0}' -f ((Get-ChildItem -File -Recurse | Measure-Object -Property Length -Sum).Sum)) bytes

DETECTED FEATURES:
"@ | Out-File $outputFile -Append

# Feature detection
if (Test-Path "node_modules") { "- Node.js dependencies installed" | Out-File $outputFile -Append }
if (Test-Path "venv" -or Test-Path "env" -or Test-Path ".venv") { "- Python virtual environment" | Out-File $outputFile -Append }
if (Test-Path ".git") { "- Git version control" | Out-File $outputFile -Append }
if (Test-Path "Dockerfile") { "- Docker containerization" | Out-File $outputFile -Append }
if (Test-Path ".github") { "- GitHub Actions/workflows" | Out-File $outputFile -Append }
if (Test-Path "tests" -or Test-Path "test") { "- Test suite present" | Out-File $outputFile -Append }

"`n=== NEXT STEPS FOR ANALYSIS ===" | Out-File $outputFile -Append
"This snapshot captures the current state of the $folderName project." | Out-File $outputFile -Append
"Use this document to understand project structure, dependencies, and codebase." | Out-File $outputFile -Append

"================================================================================`nEND OF SNAPSHOT`n================================================================================" | Out-File $outputFile -Append

Write-Output "Universal project snapshot created: $outputFile"
Write-Output "Project Type: $projectType"
Write-Output "File Size: $('{0:N0}' -f (Get-Item $outputFile).Length) characters"