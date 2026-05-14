import { prisma } from './prisma';

export async function matchEmployeeByPin(companyId: string, pin: string) {
  if (!pin) return null;
  try {
    let emp = await prisma.employee.findFirst({ where: { companyId, employeeCode: pin } });
    if (emp) return emp;
    emp = await prisma.employee.findFirst({ where: { companyId, socialSecurityNum: pin } });
    return emp || null;
  } catch (err) {
    console.error(`[attendanceEngine] matchEmployeeByPin failed (companyId=${companyId}, pin=${pin}):`, err);
    return null;
  }
}
