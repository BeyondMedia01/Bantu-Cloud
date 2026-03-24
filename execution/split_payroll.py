#!/usr/bin/env python3
import os

PAYROLL_FILE = "backend/routes/payroll.js"
OUT_DIR = "backend/routes/payroll"

def main():
    if not os.path.exists(PAYROLL_FILE):
        print("payroll.js not found.")
        return

    with open(PAYROLL_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    def get_block(start_line, end_line):
        return "".join(lines[start_line-1:end_line])

    # Extract base blocks
    imports_block = get_block(1, 14)
    # 15-42: GET /api/payroll
    # 43-108: POST /api/payroll (create)
    # 109-258: POST /api/payroll/preview
    # 259-300: POST /api/payroll/:runId/submit
    # 301-343: POST /api/payroll/:runId/approve
    # 344-1315: POST /api/payroll/:runId/process
    # 1316-1478: GET /api/payroll/:runId/reconcile
    # 1479-1554: GET /api/payroll/:runId/input-reconciliation
    # 1555-1577: GET /api/payroll/:runId
    # 1578-1636: PUT /api/payroll/:runId
    # 1637-1654: DELETE /api/payroll/:runId
    # 1655-1717: GET /api/payroll/:runId/payslips
    # 1718-1757: GET /api/payroll/:runId/payslips/:id/pdf
    # 1758-1831: GET /api/payroll/:runId/summary/pdf
    # 1832-1937: GET /api/payroll/:runId/payslip-summary
    # 1938-1971: GET /api/payroll/:runId/export
    # 1972-2091: GET /api/payroll/:runId/variance
    # 2092-END: Payslip email dispatch

    process_block = get_block(109, 258) + get_block(344, 1315)
    reports_block = get_block(1316, 1554) + get_block(1938, 2091)
    payslips_block = get_block(1655, 1937) + get_block(2092, len(lines) - 2) # exclude module.exports = router
    crud_block = get_block(15, 108) + get_block(259, 343) + get_block(1555, 1654)

    os.makedirs(OUT_DIR, exist_ok=True)

    # Sub-files imports: adjust ../ to ../../
    sub_imports = imports_block.replace("'../", "'../../")

    # Write process.js
    with open(f"{OUT_DIR}/process.js", "w", encoding='utf-8') as f:
        f.write(sub_imports)
        f.write("const router = express.Router({ mergeParams: true });\n\n")
        f.write(process_block)
        f.write("\nmodule.exports = router;\n")

    # Write reports.js
    with open(f"{OUT_DIR}/reports.js", "w", encoding='utf-8') as f:
        f.write(sub_imports)
        f.write("const router = express.Router({ mergeParams: true });\n\n")
        f.write(reports_block)
        f.write("\nmodule.exports = router;\n")

    # Write payslips.js
    with open(f"{OUT_DIR}/payslips.js", "w", encoding='utf-8') as f:
        f.write(sub_imports)
        f.write("const router = express.Router({ mergeParams: true });\n\n")
        f.write(payslips_block)
        f.write("\nmodule.exports = router;\n")

    # Write base payroll.js
    with open(PAYROLL_FILE, "w", encoding='utf-8') as f:
        f.write(imports_block)
        f.write("\n// --- Sub-Routers ---\n")
        f.write("router.use('/', require('./payroll/process'));\n")
        f.write("router.use('/', require('./payroll/reports'));\n")
        f.write("router.use('/', require('./payroll/payslips'));\n\n")
        f.write("// --- Base CRUD ---\n")
        f.write(crud_block)
        f.write("\nmodule.exports = router;\n")

    print(f"Successfully split payroll.js into {OUT_DIR}/[process.js, reports.js, payslips.js]")

if __name__ == "__main__":
    main()
