#!/usr/bin/env python3
import os

REPORTS_FILE = "backend/routes/reports.js"
OUT_DIR = "backend/routes/reports"

def main():
    if not os.path.exists(REPORTS_FILE):
        print("reports.js not found.")
        return

    with open(REPORTS_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    def get_block(start_line, end_line):
        return "".join(lines[start_line-1:end_line])

    # Extract base blocks
    imports_block = get_block(1, 16) 
    
    # Block definitions based on grep
    # 18: // ─── Payslip Report
    # 63: // ─── Tax Report (P16)
    # 132: // ─── Leave Report
    # 178: // ─── Loans Report
    # 224: // ─── Departments / Headcount Report
    # 248: // ─── Journals Report
    # 290: // ─── Summary Stats
    # 331: // ─── Payroll Trend
    # 366: // ─── ZIMRA P2 Monthly Return
    # 429: // ─── NSSA P4A Monthly Return
    # 493: // ─── Bank EFT / Bulk Pay Export
    # 613: // ─── IT7 Tax Certificate
    # 729: // ─── Pension Fund Exports
    # 861: // ─── Payroll Variance Report

    employees_block = get_block(132, 177) + get_block(224, 247)
    loans_block = get_block(178, 223)
    statutory_block = get_block(63, 131) + get_block(366, 428) + get_block(429, 492) + get_block(613, 728) + get_block(729, 860)
    payroll_block = get_block(18, 62) + get_block(248, 289) + get_block(290, 330) + get_block(331, 365) + get_block(493, 612) + get_block(861, len(lines) - 2)

    os.makedirs(OUT_DIR, exist_ok=True)

    # Sub-files imports: adjust ../ to ../../
    # Also strip the single router instance we don't want duplicated
    sub_imports = imports_block.replace("'../", "'../../").replace("const router = express.Router();\n", "")

    # Write employees.js
    with open(f"{OUT_DIR}/employees.js", "w", encoding='utf-8') as f:
        f.write(sub_imports)
        f.write("const router = express.Router({ mergeParams: true });\n\n")
        f.write(employees_block)
        f.write("\nmodule.exports = router;\n")

    # Write loans.js
    with open(f"{OUT_DIR}/loans.js", "w", encoding='utf-8') as f:
        f.write(sub_imports)
        f.write("const router = express.Router({ mergeParams: true });\n\n")
        f.write(loans_block)
        f.write("\nmodule.exports = router;\n")

    # Write statutory.js
    with open(f"{OUT_DIR}/statutory.js", "w", encoding='utf-8') as f:
        f.write(sub_imports)
        f.write("const router = express.Router({ mergeParams: true });\n\n")
        f.write(statutory_block)
        f.write("\nmodule.exports = router;\n")
        
    # Write payroll.js (the sub-router for operations)
    with open(f"{OUT_DIR}/payroll.js", "w", encoding='utf-8') as f:
        f.write(sub_imports)
        f.write("const router = express.Router({ mergeParams: true });\n\n")
        f.write(payroll_block)
        f.write("\nmodule.exports = router;\n")

    # Write base reports.js (acts as hub)
    with open(REPORTS_FILE, "w", encoding='utf-8') as f:
        f.write(imports_block)
        f.write("\n// --- Report Domains ---\n")
        f.write("router.use('/', require('./reports/employees'));\n")
        f.write("router.use('/', require('./reports/loans'));\n")
        f.write("router.use('/', require('./reports/statutory'));\n")
        f.write("router.use('/', require('./reports/payroll'));\n")
        f.write("\nmodule.exports = router;\n")

    print(f"Successfully split reports.js into {OUT_DIR}/[employees.js, loans.js, statutory.js, payroll.js]")

if __name__ == "__main__":
    main()
