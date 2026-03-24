#!/usr/bin/env python3
import os

EMP_FILE = "backend/routes/employees.js"
OUT_DIR = "backend/services"
OUT_FILE = f"{OUT_DIR}/employeeImportService.js"

def main():
    if not os.path.exists(EMP_FILE):
        return

    with open(EMP_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    def get_block(start_line, end_line):
        return "".join(lines[start_line-1:end_line])

    # Extract required helper functions from employees.js
    pick_fields_block = get_block(83, 141)
    
    # Extract the logic inside the POST /import handler (line 402 to 528)
    # The handler starts at 396
    handler_body = get_block(402, 528)
    
    # Correct the indentation inside handler_body (remove 2 leading spaces)
    import_logic = ""
    for line in handler_body.splitlines(True):
        if line.startswith("  "):
            import_logic += line[2:]
        else:
            import_logic += line

    os.makedirs(OUT_DIR, exist_ok=True)

    with open(OUT_FILE, "w", encoding='utf-8') as f:
        f.write("const prisma = require('../lib/prisma');\n")
        f.write("const { parse: parseCSV } = require('csv-parse/sync');\n")
        f.write("const XLSX = require('xlsx');\n\n")
        
        f.write("function isValidTin(tin) {\n  if (!tin) return true;\n  const stripped = String(tin).trim();\n  return /^\\d{10}$/.test(stripped) || /^[A-Z0-9]{10,15}$/i.test(stripped);\n}\n\n")
        
        f.write(pick_fields_block)
        f.write("\n")
        
        f.write("async function processEmployeeImport(fileBuffer, originalName, scopedCompanyId) {\n")
        f.write(import_logic.replace("return res.status(404).json({ message: 'Company not found' });", "throw new Error('Company not found');")
                            .replace("return res.status(400).json({ message:", "throw new Error(")
                            .replace("req.file.originalname", "originalName")
                            .replace("req.file.buffer", "fileBuffer")
                            .replace(" });", ");"))
        # Fix the return object syntax manually
        f.write("\n  return { message: `Import complete: ${results.created} created, ${results.failed.length} failed.`, created: results.created, failed: results.failed };\n")
        f.write("}\n\nmodule.exports = { processEmployeeImport };\n")

    # Now replace the POST /import handler in employees.js
    # We replace from line 395 to 535
    pre_import = get_block(1, 394)
    # keep isValidTin and below
    post_import = get_block(537, len(lines))

    with open(EMP_FILE, "w", encoding='utf-8') as f:
        f.write(pre_import)
        f.write("// POST /api/employees/import — bulk create from CSV or Excel\n")
        f.write("const { processEmployeeImport } = require('../services/employeeImportService');\n")
        f.write("router.post('/import', requirePermission('manage_employees'), upload.single('file'), async (req, res) => {\n")
        f.write("  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });\n")
        f.write("  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });\n")
        f.write("  try {\n")
        f.write("    const result = await processEmployeeImport(req.file.buffer, req.file.originalname, req.companyId);\n")
        f.write("    res.json(result);\n")
        f.write("  } catch (error) {\n")
        f.write("    res.status(400).json({ message: error.message });\n")
        f.write("  }\n")
        f.write("});\n\n")
        f.write(post_import)

    print("Successfully extracted employeeImportService.js")

if __name__ == "__main__":
    main()
