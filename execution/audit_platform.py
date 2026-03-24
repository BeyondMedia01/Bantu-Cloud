#!/usr/bin/env python3
import os
import glob
import re

ROUTES_DIR = "backend/routes"
OUTPUT_FILE = ".tmp/platform_audit_results.md"

def audit_file(filepath):
    findings = []
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        lines = content.split('\n')
        
    filename = os.path.basename(filepath)
    
    # 1. Look for unshared Prisma instances
    if "new PrismaClient(" in content:
        findings.append(f"- **[Performance]** `{filename}` instantiates its own `new PrismaClient()`. It should use the shared singleton.")
        
    # 2. Look for insecure headers
    if "req.headers['x-company-id']" in content or 'req.headers["x-company-id"]' in content:
        findings.append(f"- **[Security]** `{filename}` reads `x-company-id` directly from headers instead of using the validated `req.companyId`. This is an IDOR vulnerability risk.")
        
    # 3. Look for complete lack of auth
    is_public_allowlist = ['auth.js', 'webhooks.js', 'biometric.js', 'setup.js']
    if filename not in is_public_allowlist:
        if "authenticateToken" not in content and "requirePermission" not in content:
            findings.append(f"- **[Security]** `{filename}` has no `authenticateToken` or `requirePermission` visible in the file. Ensure routes are protected.")
            
    # 4. Check for unhandled async route handlers (missing try/catch)
    # Simple regex to find route handlers
    route_pattern = re.compile(r'(?:router\.(?:get|post|put|patch|delete))\(.*?async\s*\(\s*req\s*,\s*res.*?=>\s*\{')
    for i, line in enumerate(lines):
        if route_pattern.search(line):
            # Check next 3 lines for a try block start
            block = "\n".join(lines[i:i+4])
            if "try {" not in block:
                findings.append(f"- **[Code Quality]** `{filename}:{i+1}` Handler appears to be missing a top-level `try/catch` block. Unhandled rejections will crash the server.")
                
    # 5. Look for mass-assignment risks implicitly (e.g., ...req.body in create/update)
    for i, line in enumerate(lines):
        if (".create({" in line or ".update({" in line or ".upsert({" in line) and "...req.body" in line:
            findings.append(f"- **[Security]** `{filename}:{i+1}` spreads `req.body` directly into a Prisma mutation. This is a mass-assignment vulnerability.")
            
    return findings

def main():
    if not os.path.exists(ROUTES_DIR):
        print(f"Error: Directory {ROUTES_DIR} not found.")
        return
        
    all_findings = {}
    total_issues = 0
    
    for filepath in glob.glob(f"{ROUTES_DIR}/*.js"):
        file_findings = audit_file(filepath)
        if file_findings:
            all_findings[os.path.basename(filepath)] = file_findings
            total_issues += len(file_findings)
            
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        out.write("# Deterministic Automated Platform Audit\n\n")
        out.write(f"**Total issues found:** {total_issues}\n\n")
        
        if not all_findings:
            out.write("No configured issues detected!\n")
        else:
            for filename, findings in all_findings.items():
                out.write(f"### {filename}\n")
                for finding in findings:
                    out.write(f"{finding}\n")
                out.write("\n")
                
    print(f"Audit complete. Formatted report written to {OUTPUT_FILE} with {total_issues} findings.")

if __name__ == "__main__":
    main()
