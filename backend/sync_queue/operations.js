/**
 * Named operations registry for the sync queue.
 * Each handler receives (payload, prisma) and must be idempotent where possible.
 * Handlers throw on failure — the caller handles retry logic.
 */
const operations = {
  // --- Employees ---
  CREATE_EMPLOYEE: async (payload, prisma) => {
    return prisma.employee.upsert({
      where: { id: payload.id },
      create: payload,
      update: payload,
    });
  },
  UPDATE_EMPLOYEE: async (payload, prisma) => {
    const { id, ...data } = payload;
    return prisma.employee.update({ where: { id }, data });
  },
  DELETE_EMPLOYEE: async (payload, prisma) => {
    return prisma.employee.delete({ where: { id: payload.id } });
  },

  // --- Companies ---
  CREATE_COMPANY: async (payload, prisma) => {
    return prisma.company.upsert({
      where: { id: payload.id },
      create: payload,
      update: payload,
    });
  },
  UPDATE_COMPANY: async (payload, prisma) => {
    const { id, ...data } = payload;
    return prisma.company.update({ where: { id }, data });
  },

  // --- Payroll Runs ---
  CREATE_PAYROLL_RUN: async (payload, prisma) => {
    return prisma.payrollRun.upsert({
      where: { id: payload.id },
      create: payload,
      update: payload,
    });
  },
  UPDATE_PAYROLL_RUN: async (payload, prisma) => {
    const { id, ...data } = payload;
    return prisma.payrollRun.update({ where: { id }, data });
  },

  // --- Payslips ---
  CREATE_PAYSLIP: async (payload, prisma) => {
    return prisma.payslip.upsert({
      where: { id: payload.id },
      create: payload,
      update: payload,
    });
  },
  UPDATE_PAYSLIP: async (payload, prisma) => {
    const { id, ...data } = payload;
    return prisma.payslip.update({ where: { id }, data });
  },
};

/**
 * Execute a named operation.
 * @param {string} name - Operation name (e.g. "CREATE_EMPLOYEE")
 * @param {object} payload - Parsed operation payload
 * @param {object} prisma - Prisma client instance
 */
async function executeOperation(name, payload, prisma) {
  const handler = operations[name];
  if (!handler) {
    throw new Error(`Unknown sync operation: ${name}`);
  }
  return handler(payload, prisma);
}

/**
 * Check if an operation name is registered.
 */
function isKnownOperation(name) {
  return name in operations;
}

module.exports = { executeOperation, isKnownOperation, operations };
