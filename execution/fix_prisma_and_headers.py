#!/usr/bin/env python3
import os
import glob
import re

ROUTES_DIR = "backend/routes"

def fix_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    original_content = content
    
    # 1. Remove the PrismaClient import line
    content = re.sub(r"const\s*\{\s*PrismaClient\s*\}\s*=\s*require\(['\"]@prisma/client['\"]\);?\s*\n?", "", content)
    
    # 2. Replace the local instantiation with the shared singleton
    # Matches: const prisma = new PrismaClient(); or const prisma = new PrismaClient({...});
    content = re.sub(r"const\s+prisma\s*=\s*new\s+PrismaClient\(\s*(?:\{[^\}]*\}\s*)?\);?", "const prisma = require('../lib/prisma');", content)
    
    # 3. Replace direct header reads with context variable
    content = re.sub(r"req\.headers\[['\"]x-company-id['\"]\]", "req.companyId", content)
    content = re.sub(r"req\.header\(['\"]x-company-id['\"]\)", "req.companyId", content)

    if content != original_content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    return False

def main():
    fixed_count = 0
    for filepath in glob.glob(f"{ROUTES_DIR}/*.js"):
        if fix_file(filepath):
            fixed_count += 1
            print(f"Fixed: {filepath}")
            
    print(f"Total files fixed: {fixed_count}")

if __name__ == "__main__":
    main()
